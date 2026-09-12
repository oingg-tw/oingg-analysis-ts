import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';
import { dividendPayoutRatioBadge } from './dividendPayoutRatioBadge';

export const dividendPayoutRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'dividendPayoutRatio',
  name: '盈餘發放率',
  unit: '%',
  formulaNote:
    'TTM = |近四季（含本季）股利發放加總| / 近四季淨利加總 * 100，淨利優先採歸屬母公司口徑，' +
    '淨利須為正才有意義（≤0 視為 zero_or_negative_denominator）。沒有 Q/Q_ANN——股利通常一年' +
    '發放 1-2 次，單季配息率會嚴重失真（跟 src/domainMetrics/dividendPayoutRatio.ts 現有規則一致）。',
  formulaLatex: '\\mathrm{DividendPayoutRatio} = \\frac{\\left|\\sum_{i=1}^{4}\\mathrm{DividendsPaid}_i\\right|}{\\sum_{i=1}^{4}\\mathrm{NetIncome}_i} \\times 100',
  referenceUrl: 'https://en.wikipedia.org/wiki/Dividend_payout_ratio',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）'],
  // academicSourceUrl 出處/推導過程見 dividendPayoutRatioBadge.ts 的更正說明。
  academicSourceUrl:
    'https://www.fidelity.com/bin-public/060_www_fidelity_com/documents/Payout-Ratio-The-Most-Influential-Management-Decision-a-Company-Can-Make-retail.pdf',
  badge: dividendPayoutRatioBadge,
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'dividendsPaid'],
  currentFormulaVersion: 1,
};
