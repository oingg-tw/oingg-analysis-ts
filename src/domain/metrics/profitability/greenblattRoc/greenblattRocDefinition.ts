import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const greenblattRocDefinition: MetricDefinitionSpec = {
  metricCode: 'greenblattRoc',
  name: 'Greenblatt 資本報酬率',
  unit: '%',
  formulaNote:
    '= EBIT(TTM) / (淨營運資金 + 淨固定資產) * 100。EBIT(TTM) = 近四季（含本季）稅前淨利+' +
    '利息費用加總；淨營運資金 = 本季流動資產 - 本季流動負債（Greenblatt 原始定義會再排除' +
    '超額現金/不計息流動負債，這裡採業界常見的簡化版，跟 ncav/cashConversionCycle 用的' +
    '流動資產-流動負債同一組欄位）；淨固定資產 = 本季期末不動產廠房及設備（帳面淨額）。' +
    '跟一般 roic/roce（用投入資本/股東權益+負債當分母）刻意分開——Greenblatt 用「淨營運' +
    '資金+淨固定資產」代表營運實際佔用的有形資本，排除超額現金跟商譽等無形資產膨脹分母。' +
    '只有 TTM 一種 basis。',
  formulaLatex: '\\mathrm{GreenblattRoc} = \\frac{\\mathrm{EBIT}_{\\mathrm{TTM}}}{\\mathrm{NWC} + \\mathrm{NetFixedAssets}} \\times 100',
  referenceUrl: 'https://www.investing.com/academy/analysis/what-is-magic-formula-investing/',
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['profit_loss_before_tax', 'finance_costs', 'current_assets', 'current_liabilities', 'property_plant_and_equipment'],
  currentFormulaVersion: 1,
};
