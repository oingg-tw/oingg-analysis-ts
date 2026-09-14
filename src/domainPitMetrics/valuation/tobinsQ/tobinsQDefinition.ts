import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';
import { tobinsQBadge } from './tobinsQBadge';

export const tobinsQDefinition: MetricDefinitionSpec = {
  metricCode: 'tobinsQ',
  name: '托賓Q值',
  unit: '倍',
  formulaNote:
    '= (市值 + 總負債) / 總資產。市值 = 流通股數 × 股價（見 marketCap 指標，同一套查詢邏輯）；' +
    '總負債/總資產取本季資產負債表期末餘額。Q > 1 代表市場對企業資產的評價高於帳面重置成本' +
    '（可能反映品牌/專利等未入帳的無形資產），Q < 1 代表市場評價低於帳面資產，也可能是併購' +
    '溢價低/資產閒置的訊號。只有 Q 一種 basis——資產負債表時點快照，沒有 TTM/年化概念，' +
    '跟 ncav/bvps 同一種性質。',
  formulaLatex: '\\mathrm{TobinsQ} = \\frac{\\mathrm{MarketCap} + \\mathrm{Liabilities}}{\\mathrm{Assets}}',
  academicSourceUrl: 'https://ideas.repec.org/a/mcb/jmoncb/v1y1969i1p15-29.html',
  referenceUrl: 'https://en.wikipedia.org/wiki/Tobin%27s_q',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['liabilities', 'assets', 'paidInShares', 'daily_price.close'],
  currentFormulaVersion: 1,
  badge: tobinsQBadge,
};
