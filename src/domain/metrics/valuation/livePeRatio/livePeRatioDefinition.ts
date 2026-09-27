import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-27 新增——peRatio 的即時版本，見 application/metrics/valuation/livePeRatio/computeLivePeRatio.ts 檔頭說明。
// 逐日型（snapshot），跟 peRatio 的 group:'period' 不同。
export const livePeRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'livePeRatio',
  name: '本益比',
  nameEn: 'PER',
  nameSuffix: '即時',
  unit: '倍',
  formulaNote:
    '= 當天收盤價 / EPS(TTM，近四季淨利扣特別股股利 ÷ 流通在外普通股)。EPS 換算到跟當天股價同一個股數基準：最新財報季末之後的' +
    '除權（股票股利）、面額換發、減資恢復交易，當天就照比例換算（IAS 33 對股票股利、分割、反分割追溯調整每股盈餘）；現金增資等' +
    '新發行的股份在股本登記生效時加入股數。每個交易日更新。EPS_TTM 剛好等於 0 才是 null，為負仍計算出真實但為負的本益比。',
  formulaLatex: '\\mathrm{PE}_{\\mathrm{live}} = \\frac{\\mathrm{Close}}{\\mathrm{EPS}_{\\mathrm{TTM}}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%9C%AC%E7%9B%8A%E6%AF%94',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '公開發行公司股利分派公告', '證交所／櫃買中心每日收盤價'],
  group: 'snapshot',
  allowedSnapshotCadences: ['EOD'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'outstandingCommonShares', 'dividend_distribution', 'daily_price.close'],
  currentFormulaVersion: 1,
};
