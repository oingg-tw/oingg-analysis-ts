import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const dividendPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'dividendPerShare',
  name: '每股股利',
  nameEn: 'Dividend Per Share',
  unit: '元',
  formulaNote:
    'TTM = 除息日落在近一年（該季季末往前一年，不含起點當天）的普通股每股現金股利加總，取自公司公告的每股配發金額' +
    '（盈餘分配 + 法定盈餘公積與資本公積發放）。只含普通股、不含特別股股利；公告本來就是每股金額，不需要除以股數。' +
    '只有 TTM 一種 basis——股利通常一年發放 1-2 次，單季數字大多是 0。窗口起點早於 2019-10 的季度為 null（歷史不足，' +
    '股利公告全市場資料從民國 108 年度的分派起）；公司在股利公告資料裡一筆都沒有時為 null（缺資料，分不出從未配息或未收錄）。' +
    '（2026-09-25 formulaVersion 2：原本是現金流量表「發放現金股利」÷ 流通股數，會把特別股股利算進去、分母又含特別股股數。）',
  formulaLatex: '\\mathrm{DividendPerShare}_{\\mathrm{TTM}} = \\sum_{\\text{近一年除息}} \\mathrm{CashDividendPerCommonShare}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Dividend',
  tier: 'derived',
  sources: ['公開資訊觀測站股利分派公告'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['cash_dividend_from_earnings', 'cash_dividend_from_legal_reserve_and_capital_surplus', 'ex_dividend_date'],
  currentFormulaVersion: 2,
};
