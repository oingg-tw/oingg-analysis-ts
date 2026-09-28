import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const dividendPayoutRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'dividendPayoutRatio',
  name: '盈餘發放率',
  unit: '%',
  formulaNote:
    'TTM = |近四季（含本季）股利發放加總| / 近四季淨利加總 * 100，淨利優先採歸屬母公司口徑，' +
    '淨利須為正才有意義（≤0 視為 zero_or_negative_denominator）。沒有 Q/Q_ANN——股利通常一年' +
    '發放 1-2 次，單季配息率會嚴重失真（跟 src/domainMetrics/dividendPayoutRatio.ts 現有規則一致）。' +
    'FY（2026-09-28）= 該盈餘所屬年度的盈餘分配現金股利（每股，不含法定盈餘公積與資本公積發放）/ 該年度年報基本每股盈餘 * 100，' +
    '跟股利歷史的盈餘發放率同一個數字；EPS ≤ 0 不計算，該年度尚無分派公告時為 null。',
  formulaLatex: '\\mathrm{DividendPayoutRatio} = \\frac{\\left|\\sum_{i=1}^{4}\\mathrm{DividendsPaid}_i\\right|}{\\sum_{i=1}^{4}\\mathrm{NetIncome}_i} \\times 100',
  referenceUrl: 'https://en.wikipedia.org/wiki/Dividend_payout_ratio',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司現金流量表（XBRL）'],
  // academicSourceUrl 出處/推導過程見 dividendPayoutRatioBadge.ts 的更正說明。
  academicSourceUrl:
    'https://www.fidelity.com/bin-public/060_www_fidelity_com/documents/Payout-Ratio-The-Most-Influential-Management-Decision-a-Company-Can-Make-retail.pdf',
  group: 'period',
  allowedPeriodTypes: ['TTM', 'FY'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'dividendsPaid'],
  currentFormulaVersion: 2,
};
