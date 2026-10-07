import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-10-07 使用者要求的三支可排行指標，同一支 compute（computeFiftyTwoWeek）、同一份收盤價序列算出來，放同一個資料夾
// （folderName 'fiftyTwoWeek'，同 epsCagr 家族的做法）。三個 metricCode 而不是一個 metricCode 三個 timeframe：
// 三者是不同概念（報酬、距高點、距低點），溯源表一次只回一個值、screener 也是一個欄位一個排行。
// 逐日型 rollingWindow 1Y_1D（metricBasis.ts 註明 1Y×1D 就是「52 週動量基準」），每個交易日一列。
// 只算股價、不含現金股利（使用者選定）；配股／分割／面額變更／減資換算到今天的股數基準（見 calculateFiftyTwoWeek.ts）。
type FiftyTwoWeekSpec = Pick<MetricDefinitionSpec, 'metricCode' | 'name' | 'nameEn' | 'formulaNote' | 'formulaLatex' | 'referenceUrl' | 'academicSourceUrl'>;

const fiftyTwoWeek = (spec: FiftyTwoWeekSpec): MetricDefinitionSpec => ({
  ...spec,
  unit: '%',
  tier: 'derived',
  sources: ['證交所／櫃買中心每日收盤價', '公開資訊觀測站股利分派與股本變動（換算股數基準用）'],
  group: 'rollingWindow',
  allowedLookbackRanges: ['1Y'],
  allowedSamplingIntervals: ['1D'],
  allowedRollingWindowTimeframes: ['1Y_1D'],
  dependsOn: ['daily_price.close'],
  folderName: 'fiftyTwoWeek',
  currentFormulaVersion: 1,
});

const ADJUSTMENT_NOTE =
  '股價只算價格變動、不含現金股利（除息日的下跌照算）；除權、分割、面額變更、減資之前的收盤價換算成今天的股數基準' +
  '（收盤價 ÷ 股數倍數），避免股數基準改變被誤算成漲跌。用每日收盤價，不用盤中最高／最低價。' +
  '上市未滿一年（股價序列開始得比一年前晚）為 insufficient_history，不用較短的期間頂替。';

export const priceReturn52wDefinition = fiftyTwoWeek({
  metricCode: 'priceReturn52w',
  name: '52 週股價漲跌幅',
  nameEn: '52-Week Price Return',
  formulaNote: `= (最新收盤價 / 一年前當天或之前最後一個交易日的收盤價 − 1) × 100。${ADJUSTMENT_NOTE}`,
  formulaLatex: '\\mathrm{Return}_{52w} = \\left(\\frac{P_t}{P_{t-1y}} - 1\\right) \\times 100',
  referenceUrl: 'https://www.investopedia.com/terms/p/price-return.asp',
});

export const distanceFrom52wHighDefinition = fiftyTwoWeek({
  metricCode: 'distanceFrom52wHigh',
  name: '距 52 週高點',
  nameEn: 'Distance from 52-Week High',
  formulaNote: `= (最新收盤價 / 過去 52 週最高收盤價 − 1) × 100，恆 ≤ 0，0 代表今天就是 52 週新高。照 George & Hwang（2004）以 52 週最高收盤價為基準的做法。${ADJUSTMENT_NOTE}`,
  formulaLatex: '\\mathrm{DistHigh}_{52w} = \\left(\\frac{P_t}{\\max_{52w} P} - 1\\right) \\times 100',
  academicSourceUrl: 'https://doi.org/10.1111/j.1540-6261.2004.00695.x',
  referenceUrl: 'https://www.investopedia.com/terms/1/52weekhighlow.asp',
});

export const distanceFrom52wLowDefinition = fiftyTwoWeek({
  metricCode: 'distanceFrom52wLow',
  name: '距 52 週低點',
  nameEn: 'Distance from 52-Week Low',
  formulaNote: `= (最新收盤價 / 過去 52 週最低收盤價 − 1) × 100，恆 ≥ 0，0 代表今天就是 52 週新低。${ADJUSTMENT_NOTE}`,
  formulaLatex: '\\mathrm{DistLow}_{52w} = \\left(\\frac{P_t}{\\min_{52w} P} - 1\\right) \\times 100',
  referenceUrl: 'https://www.investopedia.com/terms/1/52weekhighlow.asp',
});
