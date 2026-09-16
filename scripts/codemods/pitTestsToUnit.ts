import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Phase 5-2 一次性 codemod：把 tests/integration/application/metrics/*Pit.test.ts（打真實 DB 的指標整合測試）
// 改寫成 tests/unit/application/metrics/*Pit.test.ts（cassette 回放，見 tests/fakes/pit/cassette.ts）：
//   - computeAndWriteXxxPit(q)             → replay.run(computeXxx)(q)（三個巢狀 family 用 runNested）
//   - analysisPrisma.metricValue.findFirst({ where, orderBy }) → replay.findLatest(where)；findMany/count 同理
//   - 只做 upsertMetricDefinition 的 beforeAll、只做 $disconnect 的 afterAll 整段刪掉
//   - bootstrap/prisma 的 import 刪掉，改 import 對應的 computeXxx + createPitReplay
// 純文字/regex 改寫（這 60 支測試的形狀高度一致），改完的檔案用 typecheck + 單元測試驗證；還殘留
// DB/bootstrap 引用的檔案印成 MANUAL 清單，手動處理。
// 用法：npx tsx scripts/codemods/pitTestsToUnit.ts [--dry-run] [名稱...]

const SRC_DIR = 'tests/integration/application/metrics';
const DST_DIR = 'tests/unit/application/metrics';
const dryRun = process.argv.includes('--dry-run');
// --fix-unit：對已經搬到 tests/unit 的檔案再跑一次改寫（regex 補強後補救殘留），不搬檔、不重複插 import。
const fixUnit = process.argv.includes('--fix-unit');
const only = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--')));

// 一層巢狀的物件字面值（where 裡的 `metricCode: { in: [...] }`）或識別字/呼叫式（`where` / `COORD('2330', 'x')`）。
const WHERE = String.raw`(\{(?:[^{}]|\{[^{}]*\})*\}|\w+(?:\([^()]*\))?)`;

const bootstrapSrc = readFileSync('src/bootstrap/pitMetrics.ts', 'utf8');
const importPaths = new Map<string, string>();
for (const m of bootstrapSrc.matchAll(/import \{ (compute\w+) \} from '([^']+)';/g)) importPaths.set(m[1]!, m[2]!);
const bindings = new Map<string, { compute: string; nested: string | null }>();
for (const m of bootstrapSrc.matchAll(/export const (computeAndWrite\w+Pit) = (runPit|runPitNested)\((compute\w+)(?:, '(\w+)')?\);/g)) {
  bindings.set(m[1]!, { compute: m[3]!, nested: m[2] === 'runPitNested' ? m[4]! : null });
}

const manual: string[] = [];
mkdirSync(DST_DIR, { recursive: true });

const sourceDir = fixUnit ? DST_DIR : SRC_DIR;
for (const file of readdirSync(sourceDir).filter((f) => f.endsWith('Pit.test.ts')).sort()) {
  const name = file.replace(/\.test\.ts$/, '');
  if (only.size > 0 && !only.has(name)) continue;
  const srcPath = path.join(sourceDir, file);
  const dstPath = path.join(DST_DIR, file);
  let src = readFileSync(srcPath, 'utf8');
  const alreadyConverted = src.includes('createPitReplay(');

  // 1. 拿掉 bootstrap / prisma 的 import。
  src = src.replace(/^import \{[^}]*\} from '@\/bootstrap\/pitMetrics';\r?\n/m, '');
  src = src.replace(/^import \{ upsertMetricDefinition \} from '@\/bootstrap\/metricDefinitions';\r?\n/m, '');
  src = src.replace(/^import [^\n]* from '@\/infrastructure\/prisma\/[^']+';\r?\n/gm, '');

  // 2. 只做 upsertMetricDefinition 的 beforeAll（單行 await 或 Promise.all(...map(upsertMetricDefinition)) 都算）、
  //    只做 $disconnect 的 afterAll。
  src = src.replace(/beforeAll\(async \(\) => \{\r?\n([\s\S]*?)\r?\n\}\);\r?\n(?:\r?\n)?/g, (whole, body: string) => {
    const onlyUpserts = body.includes('upsertMetricDefinition') && !/await (?!Promise\.all|upsertMetricDefinition)/.test(body);
    return onlyUpserts ? '' : whole;
  });
  src = src.replace(/afterAll\(async \(\) => \{\r?\n(?:[ \t]*await \w+\.\$disconnect\(\);\r?\n)+\}\);\r?\n(?:\r?\n)?/g, '');

  // 3. compute 呼叫。
  const used = new Set<string>();
  src = src.replace(/computeAndWrite(\w+)Pit\(/g, (_match, n: string) => {
    const binding = bindings.get(`computeAndWrite${n}Pit`);
    if (!binding) throw new Error(`${name}: src/bootstrap/pitMetrics.ts 找不到 computeAndWrite${n}Pit`);
    used.add(binding.compute);
    return binding.nested ? `replay.runNested(${binding.compute}, '${binding.nested}')(` : `replay.run(${binding.compute})(`;
  });

  // 4. Prisma 讀取。
  const model = String.raw`analysisPrisma\.(?:metricValue|metricDailyCadenceValue)`;
  src = src.replace(new RegExp(`${model}\\.findFirst\\(\\{\\s*where: ${WHERE},\\s*orderBy: \\{[^}]*\\},?\\s*\\}\\)`, 'g'), 'replay.findLatest($1)');
  src = src.replace(new RegExp(`${model}\\.findMany\\(\\{\\s*where: ${WHERE},\\s*orderBy: \\{[^}]*\\},?\\s*\\}\\)`, 'g'), 'replay.findMany($1)');
  src = src.replace(new RegExp(`${model}\\.count\\(\\{\\s*where: ${WHERE},?\\s*\\}\\)`, 'g'), 'replay.count($1)');

  // 5. registry 只在被刪掉的 beforeAll 用到的話，import 也拿掉。
  const bodyWithoutImports = src.replace(/^import[^\n]*\r?\n/gm, '');
  if (!/metricDefinitionRegistry/.test(bodyWithoutImports)) {
    src = src.replace(/^import \{ metricDefinitionRegistry \} from '@\/application\/metrics\/metricDefinitionRegistry';\r?\n/m, '');
  }

  // 6. vitest import 只留還在用的名字。
  src = src.replace(/^import \{([^}]*)\} from 'vitest';/m, (_match, names: string) => {
    const keep = names
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((n) => new RegExp(`\\b${n}\\(`).test(bodyWithoutImports));
    return `import { ${keep.join(', ')} } from 'vitest';`;
  });

  // 7. 補 compute + replay 的 import，然後宣告 replay（--fix-unit 已轉換過的檔案跳過）。
  if (!alreadyConverted) {
    const computeImports = [...used].sort().map((c) => {
      const p = importPaths.get(c);
      if (!p) throw new Error(`${name}: src/bootstrap/pitMetrics.ts 找不到 ${c} 的 import`);
      return `import { ${c} } from '${p}';`;
    });
    const header = [...computeImports, `import { createPitReplay } from '../../../fakes/pit/replayHarness';`].join('\n');
    const importBlock = src.match(/^(?:import[^\n]*\r?\n)+/m);
    if (!importBlock || importBlock.index === undefined) throw new Error(`${name}: 找不到 import 區塊`);
    const insertAt = importBlock.index + importBlock[0].length;
    src = `${src.slice(0, insertAt)}${header}\n\nconst replay = createPitReplay('${name}');\n${src.slice(insertAt)}`;
  }

  if (/analysisPrisma|@\/infrastructure|@\/bootstrap|upsertMetricDefinition|\$disconnect|beforeAll\(|afterAll\(/.test(src)) manual.push(name);

  if (dryRun) {
    console.log(`--- ${name} (dry-run)\n${src.slice(0, 1200)}\n...`);
    continue;
  }
  if (fixUnit) {
    writeFileSync(dstPath, src);
    console.log(`[fixed] ${name}`);
    continue;
  }
  if (existsSync(dstPath)) throw new Error(`${dstPath} 已存在`);
  writeFileSync(dstPath, src);
  execSync(`git rm -q "${srcPath}"`, { stdio: 'inherit' });
  execSync(`git add "${dstPath}"`, { stdio: 'inherit' });
  console.log(`[ok] ${name} → ${dstPath}`);
}

if (manual.length > 0) console.log(`\nMANUAL（還殘留 DB/bootstrap/hook 引用，請手動處理）：\n  ${manual.join('\n  ')}`);
