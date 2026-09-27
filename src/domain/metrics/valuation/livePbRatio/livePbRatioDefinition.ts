import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-27 新增——pbRatio 的即時版本，見 application/metrics/valuation/livePbRatio/computeLivePbRatio.ts 檔頭說明。
// 逐日型（snapshot），跟 pbRatio 的 group:'period' 不同。
export const livePbRatioDefinition: MetricDefinitionSpec = {
  metricCode: 'livePbRatio',
  name: '股價淨值比',
  nameEn: 'PBR',
  nameSuffix: '即時',
  unit: '倍',
  formulaNote:
    '= 當天收盤價 / 普通股每股淨值。每股淨值從最新財報季末出發（權益扣特別股股本 ÷ 流通在外普通股），套用季末之後的事件：' +
    '除息日扣掉現金股利（季末財報已經認列、還沒除息的，除息前先加回，因為股價還含息）、除權日按配股比例換算、面額換發與減資' +
    '恢復交易當天換算（退還股款的減資另扣退還的現金）、現金增資等新股在股本登記生效時加入。每個交易日更新。每股淨值剛好等於 0' +
    ' 才是 null，為負（資不抵債）仍計算出真實但為負的股價淨值比。',
  formulaLatex: '\\mathrm{PB}_{\\mathrm{live}} = \\frac{\\mathrm{Close}}{\\mathrm{BVPS}}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%82%A1%E5%83%B9%E6%B7%A8%E5%80%BC%E6%AF%94',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司權益變動表（XBRL）', '公開發行公司股本變動申報', '公開發行公司股利分派公告', '證交所／櫃買中心每日收盤價'],
  group: 'snapshot',
  allowedSnapshotCadences: ['EOD'],
  dependsOn: ['equity_attributable_to_owners_of_parent', 'equity', 'outstandingCommonShares', 'dividend_distribution', 'daily_price.close'],
  currentFormulaVersion: 1,
};
