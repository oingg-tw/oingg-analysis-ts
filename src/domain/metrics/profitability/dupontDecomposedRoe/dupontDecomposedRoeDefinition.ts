import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const dupontDecomposedRoeDefinition: MetricDefinitionSpec = {
  metricCode: 'dupontDecomposedRoe',
  name: '杜邦三因子拆解 ROE',
  unit: '%',
  formulaNote:
    'Q(單季) = netProfitMargin(Q) x assetTurnover(Q) x equityMultiplier(Q)；' +
    'TTM = netProfitMargin(TTM) x assetTurnover(TTM) x equityMultiplier(TTM)——2026-09-22 起週轉率與權益乘數的分母都是期間平均' +
    '（Q 兩點、TTM 5 個季末），三個因子用同一組平均分母，乘積恆等於 roe 同 basis 的值。三個因子任一為 null，' +
    '不管原因為何，一律回報 null_reason=missing_input——各因子自己缺漏的細節記在各自的 metric_value 列上。' +
    '沒有 Q_ANN——舊架構本來就沒有這個變體。',
  formulaLatex: '\\mathrm{ROE} = \\mathrm{NetProfitMargin} \\times \\mathrm{AssetTurnover} \\times \\mathrm{EquityMultiplier}',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E6%9D%9C%E9%82%A6%E5%88%86%E6%9E%90%E6%B3%95',
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  excludeFromFilterCatalog: true,
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'revenue', 'assets', 'equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 2,
};
