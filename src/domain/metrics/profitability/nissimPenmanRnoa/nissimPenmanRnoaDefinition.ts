import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const nissimPenmanRnoaDefinition: MetricDefinitionSpec = {
  metricCode: 'nissimPenmanRnoa',
  name: 'RNOA',
  unit: '%',
  formulaNote:
    'NOPAT = 營業利益*(1-有效稅率)；NOA(淨營業資產) = 權益+NFO(淨金融負債，= 有息負債-現金)；' +
    'Q(單季) = NOPAT/NOA*100；TTM = 近四季（含本季）NOPAT 加總/本季期末 NOA*100' +
    '（分母固定用本季，同 ROIC）。只遷移 RNOA 本身，不遷移 FLEV/NBC/SPREAD/reconstructedRoe' +
    '（沒有獨立查詢價值，範圍刻意限縮）。',
  formulaLatex:
    '\\mathrm{RNOA} = \\frac{\\mathrm{NOPAT}}{\\mathrm{NOA}} \\times 100,\\quad \\mathrm{NOPAT} = \\mathrm{OperatingIncome}\\times(1-\\mathrm{TaxRate}),\\quad \\mathrm{NOA} = \\mathrm{Equity} + \\mathrm{NFO}',
  academicSourceUrl: 'https://doi.org/10.1023/A:1011338221623',
  // 2026-09-10 查證過：沒有專屬的中文/英文維基百科條目（只有一般 ROA/ROE 條目，概念不同），
  // referenceUrl 刻意留空，不要拿不相關的頁面充數。
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: [
    'operatingIncome',
    'profit_loss_before_tax',
    'income_tax_expense_continuing_operations',
    'shortTermBorrowings',
    'bondsPayable',
    'longterm_borrowings',
    'cash_and_cash_equivalents',
    'equity_attributable_to_owners_of_parent',
    'equity',
  ],
  currentFormulaVersion: 1,
};
