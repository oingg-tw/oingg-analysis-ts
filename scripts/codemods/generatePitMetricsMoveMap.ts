// 2026-09-17 clean architecture 重構 Phase 0.5 第 5 步的對照表產生器：src/domainPitMetrics 依檔名
// 樣式拆兩邊，每個檔案只搬一次——
//   純的（*Definition.ts、calculate*.ts、*Badge.ts、metricBasis/metricDefinitionSpec/badgeRegistry、
//   shared/numericHelpers、shared/pickers、各 family 的 README.md）→ src/domain/metrics/<同樣的相對路徑>
//   其餘（compute*Pit.ts、get*Provenance.ts、query*.ts、registry/writer/knowledgeDate、shared/{ports,
//   badges,completeness,provenance,...}、family orchestrator）→ src/application/metrics/<同樣的相對路徑>
//   src/domainMacro 整棵 → src/application/macro
// 判斷依據是 2026-09-17 對全部 Definition/calculate/Badge 檔案 import 的稽核（只 import
// metricDefinitionSpec/metricBasis/numericHelpers，全部純），見計畫 A5。pitOutcome.ts 刻意留在
// application（它 import metricValueWriter 的型別）。
//
// 用法：npx tsx scripts/codemods/generatePitMetricsMoveMap.ts > scripts/codemods/moves/05-pitMetrics.json
// 會在 stderr 印出分類摘要跟「domain 側沒有任何檔案的指標資料夾」（GET /metrics 的資料夾掃描會
// 看不到它們，要人工確認是 orchestrator 資料夾還是漏判）。

import { readdirSync, statSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';

const ROOT = process.cwd();
const SOURCE = join(ROOT, 'src', 'domainPitMetrics');
const PURE_ROOTS = new Set(['metricBasis.ts', 'metricDefinitionSpec.ts', 'badgeRegistry.ts', 'shared/numericHelpers.ts', 'shared/pickers.ts']);

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });

const isPure = (rel: string): boolean => {
  const name = basename(rel);
  if (PURE_ROOTS.has(rel)) return true;
  if (name === 'README.md') return true;
  return name.endsWith('Definition.ts') || name.endsWith('Badge.ts') || /^calculate[A-Z]\w*\.ts$/.test(name);
};

const map: Record<string, string> = {};
const summary = { domain: 0, application: 0, other: [] as string[] };
const domainFolders = new Set<string>();
const allFolders = new Set<string>();

for (const file of listFiles(SOURCE)) {
  const rel = relative(SOURCE, file).split('\\').join('/');
  const folder = dirname(rel);
  if (folder.split('/').length === 2) allFolders.add(folder);
  if (!rel.endsWith('.ts') && basename(rel) !== 'README.md') {
    summary.other.push(rel);
    continue;
  }
  const target = isPure(rel) ? `src/domain/metrics/${rel}` : `src/application/metrics/${rel}`;
  map[`src/domainPitMetrics/${rel}`] = target;
  if (isPure(rel)) {
    summary.domain += 1;
    if (rel.endsWith('.ts')) domainFolders.add(folder);
  } else {
    summary.application += 1;
  }
}
map['src/domainMacro'] = 'src/application/macro';

const foldersWithoutDomainFiles = [...allFolders].filter((f) => !domainFolders.has(f)).sort();
console.error(`[gen-move-map] domain ${summary.domain} 檔、application ${summary.application} 檔、略過 ${summary.other.length} 檔${summary.other.length ? '：' + summary.other.join(', ') : ''}`);
console.error(`[gen-move-map] domain 側沒有任何 .ts 的指標資料夾（${foldersWithoutDomainFiles.length}）：${foldersWithoutDomainFiles.join(', ')}`);

process.stdout.write(JSON.stringify(map, null, 2) + '\n');
