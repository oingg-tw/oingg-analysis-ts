// 2026-09-10 使用者要求：前後端統一算式顯示，用 @cortex-js/compute-engine 驗證
// MetricDefinitionSpec.formulaLatex 語法正確（能還原成乾淨的 MathJSON，沒有殘留的
// 「連續單字元符號相乘」解析歧義）。目前只是試點（roe/peRatio/sue/chowderNumber），
// 這支腳本掃全部已註冊指標，只驗證有填 formulaLatex 的那些。
//
// 2026-09-10 追加：同一套驗證也套用到 MetricBadge.threshold.thresholdLatex（門檻本身
// 的 LaTeX 呈現，見 metricDefinitionSpec.ts 的欄位說明）。2026-09-14 badge 改成獨立的
// badgeRegistry.ts（Record<metricCode, MetricBadge>），不再是 definition.badge，這裡
// 改成同時掃這兩份登錄檔。
//
// 用法：pnpm tsx scripts/validateFormulaLatex.ts

import { ComputeEngine } from '@cortex-js/compute-engine';
import { metricDefinitionRegistry } from '../src/application/metrics/metricDefinitionRegistry';
import { badgeRegistry } from '../src/domain/metrics/badgeRegistry';

const ce = new ComputeEngine();

const validateOne = (label: string, latex: string): boolean => {
  try {
    const boxed = ce.parse(latex);
    const json = boxed.json;
    const roundTripLatex = ce.box(json).latex;
    console.log(`✓ ${label}\n  in:  ${latex}\n  json: ${JSON.stringify(json)}\n  out: ${roundTripLatex}`);
    return true;
  } catch (error) {
    console.error(`✗ ${label}: ${latex}`);
    console.error(error);
    return false;
  }
};

const main = () => {
  let checked = 0;
  let failed = 0;

  for (const [metricCode, definition] of Object.entries(metricDefinitionRegistry)) {
    if (definition.formulaLatex) {
      checked++;
      if (!validateOne(metricCode, definition.formulaLatex)) failed++;
    }
  }

  for (const [metricCode, badge] of Object.entries(badgeRegistry)) {
    checked++;
    if (!validateOne(`${metricCode} (threshold)`, badge.threshold.thresholdLatex)) failed++;
  }

  console.log(`\n共 ${checked} 個算式（formulaLatex + threshold.thresholdLatex），${failed} 個解析失敗。`);
  if (failed > 0) process.exitCode = 1;
};

main();
