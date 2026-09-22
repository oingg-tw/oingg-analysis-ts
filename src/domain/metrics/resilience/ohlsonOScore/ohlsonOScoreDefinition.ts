import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const ohlsonOScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'ohlsonOScore',
  name: 'Ohlson O-Score 危機預警分數',
  unit: '分',
  formulaNote:
    '9 變量 Logit 模型：SIZE=ln(總資產 ÷ GNP 物價指數)——總資產以美元計（新台幣千元 × 1000 ÷ 季末美元匯率，照原文 as reported in dollars）、指數為 FRED GNPDEF 換成 1968 年 = 100 的基期（2026-09-22 formulaVersion 2；v1 直接 ln 新台幣千元，O 值系統性低約 2）、TLTA=總負債/總資產、WCTA=(流動資產-流動負債)/總資產、' +
    'CLCA=流動負債/流動資產、OENEG=總負債>總資產?1:0、NITA=淨利(TTM)/總資產、' +
    'FUTL=營運現金流(TTM)/總負債、INTWO=今年及去年TTM淨利皆為負?1:0、' +
    'CHIN=(今年TTM淨利-去年TTM淨利)/(|今年|+|去年|)。INTWO/CHIN 需要「今年 TTM vs 去年同季' +
    'TTM」比較——去年同季 TTM 窗口用 getPastNQuarters n=5 取錨點、再從錨點往前抓 4 季建窗口，' +
    '不是新機制。只有 TTM 一種 basis。',
  formulaLatex:
    '\\mathrm{O} = -1.32 - 0.407\\,\\mathrm{SIZE} + 6.03\\,\\mathrm{TLTA} - 1.43\\,\\mathrm{WCTA} + 0.0757\\,\\mathrm{CLCA} - 1.72\\,\\mathrm{OENEG} - 2.37\\,\\mathrm{NITA} - 1.83\\,\\mathrm{FUTL} + 0.285\\,\\mathrm{INTWO} - 0.521\\,\\mathrm{CHIN}',
  academicSourceUrl: 'https://doi.org/10.2307/2490395',
  referenceUrl: 'https://en.wikipedia.org/wiki/Ohlson_O-score',
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: [
    'assets',
    'liabilities',
    'current_assets',
    'current_liabilities',
    'profit_loss_attributable_to_owners_of_parent',
    'profit_loss',
    'netCashFromOperatingActivities',
  ],
  currentFormulaVersion: 2,
};
