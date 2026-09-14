import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';
import { shareCountChangeRateBadge } from './shareCountChangeRateBadge';

export const shareCountChangeRateDefinition: MetricDefinitionSpec = {
  metricCode: 'shareCountChangeRate',
  name: '股本變化年增率',
  unit: '%',
  formulaNote:
    '= (本季流通股數 - 去年同季流通股數) / 去年同季流通股數 * 100。正值代表股數增加（現金' +
    '增資、可轉債轉換等稀釋股東權益），負值代表股數減少（庫藏股註銷減資）。去年同季用' +
    'getPastNQuarters({rocYear,season},5)[0] 取得，跟 piotroskiFScore 既有慣例一致。只有 Q' +
    ' 一種 basis——流通股數是資產負債表時點快照（跟 bvps/stockPrice 同一種性質），沒有' +
    ' TTM/年化概念。',
  formulaLatex: '\\mathrm{ShareCountChangeRate} = \\frac{\\mathrm{Shares}_t - \\mathrm{Shares}_{t-4}}{\\mathrm{Shares}_{t-4}} \\times 100',
  referenceUrl: 'https://en.wikipedia.org/wiki/Shares_outstanding',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['paidInShares'],
  currentFormulaVersion: 1,
  badge: shareCountChangeRateBadge,
};
