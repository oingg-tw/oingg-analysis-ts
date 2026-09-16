// 2026-09-17 clean architecture 重構 Phase 3 收尾：scripts/ 跟 tests/ 裡所有
// `import { computeAndWriteXxxPit } from '<…>/computeXxxPit'` 改成從 src/bootstrap/pitMetrics 拿
// （tests 用 `@/bootstrap/pitMetrics` alias，scripts 用相對路徑，跟各自既有的 import 風格一致）。
// 同一個檔案裡多個舊路徑的 import 合併成一行。跑完 shim 就可以刪。
//
// 用法：npx tsx scripts/codemods/repointPitImports.ts [--dry-run]

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { Project, QuoteKind } from 'ts-morph';

const dryRun = process.argv.includes('--dry-run');
const cwd = process.cwd();
const bootstrapModule = join(cwd, 'src', 'bootstrap', 'pitMetrics');

const listTsFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { recursive: true })) {
    const file = join(dir, String(entry));
    if (file.endsWith('.ts') && statSync(file).isFile() && !file.includes(`${join('scripts', 'codemods')}`)) out.push(file);
  }
  return out;
};

const targetSpecifier = (file: string): string => {
  if (relative(cwd, file).startsWith('tests')) return '@/bootstrap/pitMetrics';
  const rel = relative(dirname(file), bootstrapModule).replaceAll('\\', '/');
  return rel.startsWith('.') ? rel : `./${rel}`;
};

let changedFiles = 0;
for (const file of [...listTsFiles(join(cwd, 'scripts')), ...listTsFiles(join(cwd, 'tests'))]) {
  const original = readFileSync(file, 'utf8');
  if (!/from '[^']*\/compute\w+Pit'/.test(original)) continue;

  const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true, manipulationSettings: { quoteKind: QuoteKind.Single } });
  const sf = project.createSourceFile('virtual.ts', original, { overwrite: true });
  const names = new Map<string, string | undefined>(); // name -> alias
  let firstIndex = -1;
  let typeOnlyAll = true;
  for (const imp of sf.getImportDeclarations()) {
    if (!/\/compute\w+Pit$/.test(imp.getModuleSpecifierValue())) continue;
    if (firstIndex === -1) firstIndex = imp.getChildIndex();
    if (!imp.isTypeOnly()) typeOnlyAll = false;
    for (const named of imp.getNamedImports()) names.set(named.getName(), named.getAliasNode()?.getText());
    if (imp.getDefaultImport() || imp.getNamespaceImport()) console.log(`[MANUAL] ${relative(cwd, file)}：有 default/namespace import，要手動改`);
    imp.remove();
  }
  if (names.size === 0) continue;

  sf.insertImportDeclaration(firstIndex, {
    moduleSpecifier: targetSpecifier(file),
    isTypeOnly: typeOnlyAll,
    namedImports: [...names.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, alias]) => (alias ? { name, alias } : { name })),
  });

  let text = sf.getFullText();
  if (original.includes('\r\n')) text = text.replace(/\r?\n/g, '\r\n');
  changedFiles += 1;
  console.log(`[repoint] ${relative(cwd, file)}：${names.size} 個名稱 → ${targetSpecifier(file)}`);
  if (!dryRun) writeFileSync(file, text);
}
console.log(dryRun ? `[dry-run] ${changedFiles} 個檔案會被改` : `[done] 改了 ${changedFiles} 個檔案`);
