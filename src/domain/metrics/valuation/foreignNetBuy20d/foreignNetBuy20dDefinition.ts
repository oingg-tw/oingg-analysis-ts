import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-10-07 使用者要求的可排行指標。原本要的是「外資持股比率變化」，但 twse export.foreign_shareholding 只有 2330 一家
// （tpex-ts 10-07 預告會開上櫃版、沒有歷史），改做近 20 日外資買賣超——資料是 twse export.institutional_trading（T86），
// 2026-09-01 起才有、只有上市公司。上櫃：tpex-ts 10-07 評估可做（TPEx OpenAPI tpex_3insti_daily_trading，只有當天、補不了歷史），
// 還沒排上線日；上線後加查 tpex，再累積 20 個交易日才算得出來。
// 外資＝外資及陸資（不含外資自營商）＋外資自營商，同證交所三大法人統計「外資及陸資」合計的口徑。
export const foreignNetBuy20dDefinition: MetricDefinitionSpec = {
  metricCode: 'foreignNetBuy20d',
  name: '近 20 日外資買賣超佔流通股數比',
  nameEn: '20-Day Foreign Net Buy to Shares Outstanding',
  unit: '%',
  formulaNote:
    '= 最近 20 個交易日外資買賣超股數合計 / 流通在外普通股 × 100。外資買賣超＝外資及陸資（不含外資自營商）＋外資自營商，' +
    '來源是證交所三大法人買賣超日報，目前只涵蓋上市公司（上櫃公司沒有值）。20 個交易日指證交所的交易日，某天這檔沒有法人交易視為 0；' +
    '20 天內完全沒有法人交易紀錄的不寫。資料 2026-09-01 起才有，累積不足 20 個交易日為 insufficient_history。' +
    '流通在外普通股＝已發行 − 特別股 − 庫藏股，換算到當天市場交易的股數基準（除權未登記等）。',
  formulaLatex: '\\mathrm{ForeignNetBuy}_{20d} = \\frac{\\sum_{i=0}^{19} \\mathrm{NetBuy}_{t-i}}{\\mathrm{SharesOutstanding}_t} \\times 100',
  referenceUrl: 'https://www.twse.com.tw/zh/trading/foreign/t86.html',
  tier: 'derived',
  sources: ['證交所三大法人買賣超日報（T86）', '公開資訊觀測站股本變動（流通股數）'],
  group: 'rollingWindow',
  allowedLookbackRanges: ['20D'],
  allowedSamplingIntervals: ['1D'],
  allowedRollingWindowTimeframes: ['20D_1D'],
  dependsOn: ['institutional_trading.foreign_net_buy', 'institutional_trading.foreign_dealer_net_buy'],
  currentFormulaVersion: 1,
};
