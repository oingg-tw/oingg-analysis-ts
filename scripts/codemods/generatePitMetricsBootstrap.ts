// 2026-09-17 clean architecture 重構 Phase 3 收尾：從 96 支暫時的 shim（compute*Pit.ts，內容是
// `runLegacyPit(computeXxx)`）產生 src/bootstrap/pitMetrics.ts——scripts/ 跟整合測試改 import 這一支之後，
// shim 就可以整批刪掉。之後新增指標時直接手動在 pitMetrics.ts 加一行，不需要再跑這支。
//
// 用法：npx tsx scripts/codemods/generatePitMetricsBootstrap.ts

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

interface ShimEntry {
  legacyName: string; // computeAndWriteXxxPit
  computeName: string; // computeXxx
  modulePath: string; // @/application/metrics/<family>/<metric>/computeXxx
  nestUnder: string | null;
}

const root = join(process.cwd(), 'src', 'application', 'metrics');
const entries: ShimEntry[] = [];

for (const entry of readdirSync(root, { recursive: true })) {
  const file = join(root, String(entry));
  if (!/compute\w+Pit\.ts$/.test(file) || !statSync(file).isFile()) continue;
  const text = readFileSync(file, 'utf8');
  const exportLine = /export const (computeAndWrite\w+) = runLegacyPit(Nested)?\((\w+)(?:, '(\w+)')?\)/.exec(text);
  const importLine = /import \{ (\w+) \} from '\.\/(compute\w+)';/.exec(text);
  if (!exportLine || !importLine) {
    console.log(`[skip] 不是 shim：${relative(process.cwd(), file)}`);
    continue;
  }
  const relDir = relative(root, join(file, '..')).replaceAll('\\', '/');
  entries.push({
    legacyName: exportLine[1]!,
    computeName: exportLine[3]!,
    modulePath: `@/application/metrics/${relDir}/${importLine[2]}`,
    nestUnder: exportLine[4] ?? null,
  });
}

entries.sort((a, b) => a.modulePath.localeCompare(b.modulePath));

const lines: string[] = [
  `import { pitDeps } from './pitDeps';`,
  `import { persistComputations, persistOne, type PersistedBatch } from '@/application/metrics/persistComputations';`,
  `import type { PitDeps } from '@/application/metrics/deps';`,
  `import type { BasisOutcome } from '@/application/metrics/pitOutcome';`,
  `import type { ComputationSlot, MetricComputation } from '@/domain/metrics/computation';`,
  `import type { MetricValueWriteOutcome } from '@/domain/metrics/coordinate';`,
  ...entries.map((e) => `import { ${e.computeName} } from '${e.modulePath}';`),
  '',
  '// 指標核心對 scripts/ 跟整合測試的出口：每支 computeXxx（純計算、deps 注入）綁上真實的 pitDeps 並接',
  '// persistComputations 寫入，回傳攤平後的 outcome（{ symbol, rocYear, season, q, ttm, ... }）——跟重構前',
  '// computeAndWriteXxxPit 的回傳形狀一樣，所以名稱也沿用。2026-09-17 Phase 3 收尾由',
  '// scripts/codemods/generatePitMetricsBootstrap.ts 從 96 支 shim 產生一次，之後新增指標直接在這裡加一行。',
  '',
  'type Batch = { slots: Record<string, ComputationSlot> };',
  '',
  'export const runPit =',
  '  <Q, B extends Batch>(compute: (query: Q, deps: PitDeps) => Promise<B>) =>',
  '  async (query: Q): Promise<PersistedBatch<B>> =>',
  '    persistComputations(await compute(query, pitDeps), pitDeps);',
  '',
  '// epsCagr/revenueCagr/dividendGrowthRate 三個「一個回溯窗口一個 metric_code」的 family，舊 outcome 把各窗口的',
  '// 結果巢狀在 `results` 底下（verifyMetricEquivalencePit 的 key 是 "results.epsCagr3y"）——攤平後再包回去。',
  'export const runPitNested =',
  '  <Q, B extends Batch, N extends string>(compute: (query: Q, deps: PitDeps) => Promise<B>, nestUnder: N) =>',
  "  async (query: Q): Promise<Omit<B, 'slots'> & Record<N, Record<keyof B['slots'], BasisOutcome>>> => {",
  '    const batch = await compute(query, pitDeps);',
  '    const persisted = (await persistComputations(batch, pitDeps)) as Record<string, unknown>;',
  '    const { slots, ...context } = batch;',
  '    const nested = Object.fromEntries(Object.keys(slots).map((key) => [key, persisted[key]]));',
  "    return { ...context, [nestUnder]: nested } as Omit<B, 'slots'> & Record<N, Record<keyof B['slots'], BasisOutcome>>;",
  '  };',
  '',
  '// 直接寫一筆（scripts/backfillMagicFormulaRankPit.ts 這種算完不是走 computeXxx 的呼叫端用）。',
  'export const persistMetricValue = (input: MetricComputation): Promise<MetricValueWriteOutcome> => persistOne(input, pitDeps);',
  '',
  ...entries.map((e) => (e.nestUnder ? `export const ${e.legacyName} = runPitNested(${e.computeName}, '${e.nestUnder}');` : `export const ${e.legacyName} = runPit(${e.computeName});`)),
  '',
];

const target = join(process.cwd(), 'src', 'bootstrap', 'pitMetrics.ts');
writeFileSync(target, lines.join('\n'));
console.log(`寫入 ${relative(process.cwd(), target)}：${entries.length} 支（巢狀 ${entries.filter((e) => e.nestUnder).length} 支）`);
