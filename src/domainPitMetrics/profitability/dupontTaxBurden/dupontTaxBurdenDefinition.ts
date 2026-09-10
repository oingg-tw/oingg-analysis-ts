import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

  // 2026-09-07 新增：五因子 Extended DuPont，把上面 dupontDecomposedRoe 用的
  // netProfitMargin 再拆成稅務負擔×利息負擔×EBIT利潤率三層。EBIT = 稅前淨利+財務費用，
  // 跟 roic/roce/interestCoverage/netDebtToEbitda/evEbitda 已經在用的定義一致——**注意
  // 這個 EBIT 不等於既有 operatingMargin 用的 operatingIncome**（後者嚴格排除所有非
  // 營業損益，前者只加回財務費用，非營業損益還留在裡面），兩個「利潤率」數字不一樣，
  // 這批全部加 dupont 前綴避免混淆。已用 2330 115Q2 真實資料驗證過 dupontExtendedRoe
  // 精確等於既有的 dupontDecomposedRoe。
export const dupontTaxBurdenDefinition: MetricDefinitionSpec = {
  metricCode: 'dupontTaxBurden',
  displayName: '稅務負擔',
  unit: '%',
  formulaNote: 'Q(單季) = 本季淨利/本季稅前淨利*100；TTM = 近四季淨利加總/近四季稅前淨利加總*100。淨利優先採歸屬母公司口徑，缺漏退回整體口徑。',
  formulaLatex: '\\mathrm{TaxBurden} = \\frac{\\mathrm{NetIncome}}{\\mathrm{PretaxIncome}} \\times 100',
  // 沒有專屬條目，英文 DuPont analysis 條目內文定義 Tax Burden = NI/EBT。
  referenceUrl: 'https://en.wikipedia.org/wiki/DuPont_analysis',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'profit_loss_before_tax'],
  currentFormulaVersion: 1,
};
