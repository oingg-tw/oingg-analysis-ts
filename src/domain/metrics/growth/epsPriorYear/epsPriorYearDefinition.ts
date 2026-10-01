import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-10-01 使用者同意 web-nuxt 需求（只做 EPS，淨利／營收年增率不做）：epsGrowthRate 分母取 |去年同季 EPS|，只拿
// （本季 EPS, 年增率）兩個數字反推不出去年同季的正負號——6116 彩晶（−0.32 → 0.05）跟 2303 聯電（0.71 → 3.37）兩個真實
// 案例兩個分支都自洽，「由虧轉盈」跟「獲利成長」在排行裡分不開。把年增率算式裡本來就有的中繼值（去年同季 EPS，換算到本季股數基準）
// 存成獨立指標，下游可以 filter（例如 < 0 且 eps.Q > 0）。值跟 epsGrowthRate 同一份 resolver（resolveEpsGrowthRateInputs）。
export const epsPriorYearDefinition: MetricDefinitionSpec = {
  metricCode: 'epsPriorYear',
  name: '去年同季每股盈餘',
  nameEn: 'Prior-Year Quarter EPS',
  unit: '元',
  perShare: true,
  formulaNote:
    '= 去年同季的單季 EPS，換算到本季的股數基準：(去年同季淨利 − 當時近四季特別股股利÷4)*1000/去年同季報告日的流通股數，' +
    '再除以去年同季到本季的面額變更／股票股利／股數合併式減資還原倍數。跟每股盈餘成長年增率（epsGrowthRate）分母用的是同一個數字，' +
    '只是不取絕對值，所以正負號保留：去年同季虧損時為負。只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{EPS}_{t-4} = \\frac{\\mathrm{NetIncome}_{t-4} - \\mathrm{PreferredDividends}_{t-4}}{\\mathrm{OutstandingCommonShares}_{t-4} \\times \\mathrm{RestatementFactor}_{t-4 \\to t}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%AF%8F%E8%82%A1%E7%9B%88%E9%A4%98',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'outstandingCommonShares'],
  currentFormulaVersion: 1,
};
