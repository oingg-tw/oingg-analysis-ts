import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-13：從 beneishMScore 8 個變量裡曝露出來的第二支——DSRI（應收帳款營收比指數）。
// 計算邏輯見 beneishMScore/computeBeneishMScorePit.ts 的 resolveBeneishMScoreInputs()，
// 這裡純粹是另開一支 metric_code 寫入同一份算出來的 DSRI 值，不重新推導公式。
export const beneishDsriDefinition: MetricDefinitionSpec = {
  metricCode: 'beneishDsri',
  name: '應收帳款營收比指數',
  nameEn: 'Days Sales in Receivables Index (DSRI)',
  unit: '倍',
  formulaNote:
    '本期「應收帳款/營業收入」比率 ÷ 去年同期同一比率。DSRI 明顯大於 1 代表應收帳款' +
    '成長速度超過營收成長速度，可能是提早認列營收或塞貨給經銷商墊高業績。去年同季座標' +
    '比照 beneishMScore/piotroskiFScore 用 getPastNQuarters({rocYear,season},5)[0]。' +
    '只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{DSRI} = \\frac{\\mathrm{AccountsReceivable}/\\mathrm{Revenue}}{\\mathrm{AccountsReceivable}_{-4}/\\mathrm{Revenue}_{-4}}',
  academicSourceUrl: 'https://doi.org/10.2469/faj.v55.n5.2296',
  referenceUrl: 'https://en.wikipedia.org/wiki/Beneish_M-score',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['accountsReceivable', 'revenue'],
  currentFormulaVersion: 1,
};
