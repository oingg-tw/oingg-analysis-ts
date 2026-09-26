import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const dividendDistributionCountDefinition: MetricDefinitionSpec = {
  metricCode: 'dividendDistributionCount',
  name: '每年配息次數',
  nameEn: 'Dividend Distributions per Fiscal Year',
  unit: '次',
  formulaNote:
    '最近兩個有分派紀錄的盈餘所屬年度裡，單一年度通過幾次股利分派案（同一天除息只算一次），兩年取較大者——' +
    '1 次通常代表年配、2 次代表半年配、4 次代表季配。取兩年較大者是因為最新那個盈餘年度常常還沒配完（季配公司年中' +
    '只配了 2 次）。這是觀察出來的頻率，不是資料庫裡的固定分類，公司改變配息頻率時會在新年度的次數超過舊年度後反映。' +
    '資料源是 mops-ts 的股利分派公告（MOPS t108sb27），不是用現金流量表發放股利金額反推（那個看不出幾次）。' +
    '座標沿用最新一次除息日所在的日曆季度（TTM basis 維持不變），knowledge date 是那次分派案的公告日。' +
    '盈餘所屬年度全部缺值時為 null（missing_input）；沒有任何分派紀錄的公司不寫入。' +
    '（2026-09-26 formulaVersion 2：舊定義「最新除息日往前 365 天內幾次」在年配公司除息日逐年提前時會算成 2 次，' +
    '股利歷史補齊後全市場 799 家誤判，改用盈餘所屬年度。）',
  formulaLatex: '\\mathrm{DividendDistributionCount} = \\max_{y \\in \\{Y_{latest},\\, Y_{latest-1}\\}} \\left|\\{\\, d \\in \\mathrm{ExDividendDates} : \\mathrm{FiscalYear}(d) = y \\,\\}\\right|',
  referenceUrl: 'https://en.wikipedia.org/wiki/Dividend',
  tier: 'derived',
  sources: ['公開發行公司股利分派或盈餘轉增資資訊表（MOPS t108sb27）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['ex_dividend_date', 'fiscal_year'],
  currentFormulaVersion: 2,
};
