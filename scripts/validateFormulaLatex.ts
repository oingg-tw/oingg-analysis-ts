// 2026-09-10 使用者要求：前後端統一算式顯示，用 @cortex-js/compute-engine 驗證
// MetricDefinitionSpec.formulaLatex 語法正確（能還原成乾淨的 MathJSON，沒有殘留的
// 「連續單字元符號相乘」解析歧義）。目前只是試點（roe/peRatio/sue/chowderNumber），
// 這支腳本掃全部已註冊指標，只驗證有填 formulaLatex 的那些。
//
// 用法：pnpm tsx scripts/validateFormulaLatex.ts

import { ComputeEngine } from '@cortex-js/compute-engine';
import { metricDefinitionRegistry } from '../src/domainPitMetrics/metricDefinitionRegistry';

const ce = new ComputeEngine();

const main = () => {
  let checked = 0;
  let failed = 0;

  for (const [metricCode, definition] of Object.entries(metricDefinitionRegistry)) {
    if (!definition.formulaLatex) continue;
    checked++;

    try {
      const boxed = ce.parse(definition.formulaLatex);
      const json = boxed.json;
      const roundTripLatex = ce.box(json).latex;
      console.log(`✓ ${metricCode}\n  in:  ${definition.formulaLatex}\n  json: ${JSON.stringify(json)}\n  out: ${roundTripLatex}`);
    } catch (error) {
      failed++;
      console.error(`✗ ${metricCode}: ${definition.formulaLatex}`);
      console.error(error);
    }
  }

  console.log(`\n共 ${checked} 支指標有 formulaLatex，${failed} 支解析失敗。`);
  if (failed > 0) process.exitCode = 1;
};

main();
