import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const shareholderYieldDefinition: MetricDefinitionSpec = {
  metricCode: 'shareholderYield',
  name: '股東總回饋率',
  nameEn: 'Shareholder Yield',
  unit: '%',
  formulaNote:
    '= (|近四季股利發放現金加總| + |近四季買回庫藏股支付現金加總|) / 市值 * 100。獨立重新' +
    '計算，不依賴 dividendYield（交易所每日公告 passthrough，EOD 快照）或 buybackYield' +
    '（TTM 自算值）已寫入的值，兩者的 TTM 口徑直接在這裡重算一次。買回庫藏股金額只存在' +
    'XBRL 現金流量表長表，查無整列資料視為 insufficient_history（可能還沒回填，不是沒' +
    '買回）；股利發放現金缺漏視為 0（大多數季度本來就沒發放）。只有 TTM 一種 basis。',
  formulaLatex: '\\mathrm{ShareholderYield} = \\frac{|\\mathrm{DividendsPaid}| + |\\mathrm{Buyback}|}{\\mathrm{MarketCap}} \\times 100',
  referenceUrl: 'https://en.wikipedia.org/wiki/Shareholder_yield',
  tier: 'derived',
  sources: ['公開發行公司現金流量表（XBRL）', '證交所／櫃買中心每日收盤價'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['dividendsPaid', 'payments_to_acquire_treasury_shares', 'marketCap'],
  currentFormulaVersion: 1,
};
