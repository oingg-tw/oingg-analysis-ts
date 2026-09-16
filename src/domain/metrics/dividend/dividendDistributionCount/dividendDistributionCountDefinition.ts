import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const dividendDistributionCountDefinition: MetricDefinitionSpec = {
  metricCode: 'dividendDistributionCount',
  name: '過去一年配息次數',
  nameEn: 'Dividend Distribution Count (TTM)',
  unit: '次',
  formulaNote:
    '以這家公司最近一次除息交易日為基準，往前 365 天內（含基準日當天，不含第 365 天' +
    '當天——實測抓到真實邊界案例：季配公司若剛好落在跟某次歷史事件恰好相差 365 天的' +
    '位置，含頭含尾會多算 1 次，湊出 5 次而不是符合直覺的 4 次）董事會/股東會通過' +
    '的股利分派案共發生幾次——1 次通常代表年配、2 次代表半年配、4 次代表季配，但這是' +
    '「觀察出來的」次數，不是資料庫裡的固定分類欄位，同一家公司隔年可能改變配息頻率，這個' +
    '數字只反映過去一年的實際狀況，不保證未來延續。資料源是 mops-ts 的股利分派公告' +
    '（MOPS t108sb27），不是用現金流量表「發放股利」總金額反推（那個只能看金額有沒有為0，' +
    '看不出幾次）。只有 TTM 一種 basis。2026-09-15 全市場覆蓋率仍在成長中（mops-ts 回補' +
    '排在既有批次後面），只對有分派紀錄的公司計算，沒有紀錄的公司不寫入任何一列。',
  formulaLatex: '\\mathrm{DividendDistributionCount} = \\left|\\{\\, d \\in \\mathrm{ExDividendDates} : \\mathrm{Latest} - 365 \\le d \\le \\mathrm{Latest} \\,\\}\\right|',
  referenceUrl: 'https://en.wikipedia.org/wiki/Dividend',
  tier: 'derived',
  sources: ['公開發行公司股利分派或盈餘轉增資資訊表（MOPS t108sb27）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['ex_dividend_date'],
  currentFormulaVersion: 1,
};
