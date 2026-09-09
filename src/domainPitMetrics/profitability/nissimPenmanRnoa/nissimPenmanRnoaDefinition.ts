import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const nissimPenmanRnoaDefinition: MetricDefinitionSpec = {
  metricCode: 'nissimPenmanRnoa',
  displayName: '淨營業資產報酬率 (RNOA)',
  unit: '%',
  formulaNote:
    'NOPAT = 營業利益*(1-有效稅率)；NOA(淨營業資產) = 權益+NFO(淨金融負債，= 有息負債-現金)；' +
    'Q(單季) = NOPAT/NOA*100；Q_ANN = Q*4；TTM = 近四季（含本季）NOPAT 加總/本季期末 NOA*100' +
    '（分母固定用本季，同 ROIC）。只遷移 RNOA 本身，不遷移 FLEV/NBC/SPREAD/reconstructedRoe' +
    '（沒有獨立查詢價值，範圍刻意限縮）。',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
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
