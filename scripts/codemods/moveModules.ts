// 2026-09-17 clean architecture 重構 Phase 0.5 的搬檔工具：依對照表 `git mv` 檔案/資料夾，
// 並把 src/、tests/、scripts/ 裡所有受影響的 import/export specifier 改寫到新位置。
//
// 設計重點：
// - 先在「舊路徑」的世界裡算好每個 specifier 該變成什麼，再一次 git mv——相對路徑要以檔案
//   的舊位置解析、以新位置重新產生，兩件事分開做才不會算錯。
// - alias（@/...）維持 alias、相對路徑維持相對路徑，不互相轉換——保持 tsc-alias/vitest/tsx
//   三條解析路徑的行為跟搬移前完全一樣，搬家 commit 只有路徑變化。
// - 只處理 import/export 語句裡的字串字面值（含 `import type`、`export * from`、副作用 import、
//   `import()` 動態載入）；grep 過 src/tests/scripts 沒有 require()。
// - 一律先 dry-run（--dry-run 印出每個改動、不寫檔、不 git mv），確認後再真跑。
//
// 用法：
//   npx tsx scripts/codemods/moveModules.ts --map scripts/codemods/moves/01-shared.json --dry-run
//   npx tsx scripts/codemods/moveModules.ts --map scripts/codemods/moves/01-shared.json
// 對照表格式：{ "src/shared/rocQuarter.ts": "src/domain/calendar/rocQuarter.ts",
//               "src/models": "src/infrastructure/repositories" }（value 是資料夾時整棵搬、保留相對結構）
//
// 搬完之後照慣例：pnpm typecheck、pnpm test、pnpm lint:deps（Phase 6 起沒有 baseline，違規要當場修）。

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const SCAN_ROOTS = ['src', 'tests', 'scripts'];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'];

const toPosix = (p: string): string => p.split('\\').join('/');

const listFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '__snapshots__') continue;
      out.push(...listFiles(full));
    } else if (/\.(ts|tsx|mts|cts)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
};

const parseArgs = (argv: string[]): { map: string; dryRun: boolean } => {
  let map = '';
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--map' && argv[i + 1]) map = argv[++i]!;
    else if (argv[i] === '--dry-run') dryRun = true;
  }
  if (!map) throw new Error('缺 --map <對照表 json>');
  return { map, dryRun };
};

// 把對照表展開成「每個檔案的舊絕對路徑 → 新絕對路徑」。
const expandMoves = (mapping: Record<string, string>): Map<string, string> => {
  const files = new Map<string, string>();
  for (const [from, to] of Object.entries(mapping)) {
    const fromAbs = resolve(ROOT, from);
    const toAbs = resolve(ROOT, to);
    if (!existsSync(fromAbs)) throw new Error(`對照表來源不存在：${from}`);
    if (statSync(fromAbs).isDirectory()) {
      for (const file of listFiles(fromAbs)) {
        // 同一個檔案同時被「明確列出」跟「所在資料夾整棵搬」涵蓋時，明確列出的優先
        // （例如 src/api/bff/bffAuth.ts 要去 middleware，不跟著 src/api/bff 整棵搬進 modules）。
        if (!files.has(toPosix(file))) files.set(toPosix(file), toPosix(join(toAbs, relative(fromAbs, file))));
      }
    } else {
      files.set(toPosix(fromAbs), toPosix(toAbs));
    }
  }
  for (const [from, to] of files) {
    if (existsSync(to)) throw new Error(`目標已存在，拒絕覆蓋：${to}（來源 ${from}）`);
  }
  return files;
};

// 把 specifier 解析成實際檔案的絕對 posix 路徑（含副檔名）；解析不到（套件、動態字串）回 null。
const resolveSpecifier = (importerOld: string, specifier: string): string | null => {
  let base: string;
  if (specifier.startsWith('@/')) base = toPosix(resolve(ROOT, 'src', specifier.slice(2)));
  else if (specifier.startsWith('.')) base = toPosix(resolve(dirname(importerOld), specifier));
  else return null;

  const candidates = [base, ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => posix.join(base, 'index' + ext))];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};

const stripExtension = (p: string): string => p.replace(/\.(ts|tsx|mts|cts|js|mjs|cjs)$/, '').replace(/\/index$/, '');

// 用「新的 importer 位置」跟「新的目標位置」重新產生 specifier，形式跟原本一致（alias 或相對）。
const rebuildSpecifier = (originalSpecifier: string, importerNew: string, targetNew: string): string => {
  const targetNoExt = stripExtension(targetNew);
  if (originalSpecifier.startsWith('@/')) {
    const srcRoot = toPosix(resolve(ROOT, 'src'));
    if (!targetNoExt.startsWith(srcRoot + '/')) throw new Error(`alias import 指到 src/ 以外：${targetNew}`);
    return '@/' + targetNoExt.slice(srcRoot.length + 1);
  }
  let rel = toPosix(relative(dirname(importerNew), targetNoExt));
  if (!rel.startsWith('.')) rel = './' + rel;
  // 原本就是 json 之類帶副檔名的 import 就保留副檔名。
  if (originalSpecifier.endsWith('.json')) rel += '.json';
  return rel;
};

const SPECIFIER_RE = /((?:\bimport|\bexport)\s+(?:[\s\S]*?\s+from\s+)?|\bimport\s*\(\s*)(['"])([^'"\n]+)\2/g;

const main = (): void => {
  const { map, dryRun } = parseArgs(process.argv.slice(2));
  const mapping = JSON.parse(readFileSync(resolve(ROOT, map), 'utf8')) as Record<string, string>;
  const moves = expandMoves(mapping);
  const movedOldToNew = (oldPath: string): string => moves.get(oldPath) ?? oldPath;

  const allFiles = SCAN_ROOTS.flatMap((dir) => listFiles(resolve(ROOT, dir))).map(toPosix);
  const rewrites: { file: string; before: string; after: string }[] = [];
  const pendingWrites = new Map<string, string>();

  for (const fileOld of allFiles) {
    const source = readFileSync(fileOld, 'utf8');
    const fileNew = movedOldToNew(fileOld);
    let changed = false;
    const updated = source.replace(SPECIFIER_RE, (whole, prefix: string, quote: string, specifier: string) => {
      const targetOld = resolveSpecifier(fileOld, specifier);
      if (!targetOld) return whole;
      const targetNew = movedOldToNew(targetOld);
      if (targetNew === targetOld && fileNew === fileOld) return whole;
      const next = rebuildSpecifier(specifier, fileNew, targetNew);
      if (next === specifier) return whole;
      changed = true;
      rewrites.push({ file: toPosix(relative(ROOT, fileOld)), before: specifier, after: next });
      return `${prefix}${quote}${next}${quote}`;
    });
    if (changed) pendingWrites.set(fileOld, updated);
  }

  console.log(`[move-modules] 搬移 ${moves.size} 個檔案，改寫 ${rewrites.length} 個 specifier（${pendingWrites.size} 個檔案）${dryRun ? '——dry-run，不寫入' : ''}`);
  for (const r of rewrites) console.log(`  ${r.file}: ${r.before} → ${r.after}`);
  if (dryRun) {
    for (const [from, to] of moves) console.log(`  mv ${toPosix(relative(ROOT, from))} → ${toPosix(relative(ROOT, to))}`);
    return;
  }

  for (const [file, content] of pendingWrites) writeFileSync(file, content);
  for (const [from, to] of moves) {
    // git mv 不會幫忙建目標資料夾（會直接失敗）——先建好；也不要用 -k 吞掉錯誤，搬失敗要炸出來，
    // 不然會留下「import 改好了、檔案沒搬」的半套狀態（2026-09-17 第一次跑就踩到）。
    mkdirSync(dirname(to), { recursive: true });
    execFileSync('git', ['mv', toPosix(relative(ROOT, from)), toPosix(relative(ROOT, to))], { cwd: ROOT, stdio: 'inherit' });
  }
  console.log('[move-modules] 完成。接著：pnpm typecheck && pnpm test && pnpm lint:deps');
};

main();
