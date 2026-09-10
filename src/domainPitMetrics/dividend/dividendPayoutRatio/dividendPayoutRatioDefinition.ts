import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const dividendPayoutRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'dividendPayoutRatio',
  displayName: '盈餘發放率',
  unit: '%',
  formulaNote:
    'TTM = |近四季（含本季）股利發放加總| / 近四季淨利加總 * 100，淨利優先採歸屬母公司口徑，' +
    '淨利須為正才有意義（≤0 視為 zero_or_negative_denominator）。沒有 Q/Q_ANN——股利通常一年' +
    '發放 1-2 次，單季配息率會嚴重失真（跟 src/domainMetrics/dividendPayoutRatio.ts 現有規則一致）。',
  formulaLatex: '\\mathrm{DividendPayoutRatio} = \\frac{\\left|\\sum_{i=1}^{4}\\mathrm{DividendsPaid}_i\\right|}{\\sum_{i=1}^{4}\\mathrm{NetIncome}_i} \\times 100',
  referenceUrl: 'https://en.wikipedia.org/wiki/Dividend_payout_ratio',
  tier: 'derived',
  badge: {
    id: 'dividend-payout-ratio-safety',
    name: 'Fidelity 股利發放率安全門檻',
    nameEn: 'Fidelity Payout Ratio Guideline',
    author: 'Fidelity Investments（投資人教育文件）',
    summary: '股利發放率低於 Fidelity 投資人教育資料建議的安全門檻，保留較多盈餘因應景氣循環。',
    detail:
      '出自 Fidelity Investments 的投資人教育文件《Payout Ratio: The Most Influential Management Decision' +
      ' a Company Can Make?》：股利發放率（現金股利 ÷ 稅後淨利）低於 60% 時，一般被視為留有較多緩衝空間，' +
      '即使獲利下滑，也較有能力維持股利不縮減；高於 60% 則風險升高，但公用事業、REITs 等高配息產業慣例上' +
      '發放率本來就偏高，屬產業特性差異，不是絕對標準。這不是一個有專屬名稱的正式法則（不像 Chowder Rule' +
      '那樣有具體命名），也不是單一學術論文，而是 Fidelity 這份文件裡整理提出的具體門檻建議。',
    token: 'TTM',
    threshold: { description: '< 60%（Fidelity 投資人教育文件的建議門檻）', denominator: 1, comparator: 'lt', value: 60 },
  },
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'dividendsPaid'],
  currentFormulaVersion: 1,
};
