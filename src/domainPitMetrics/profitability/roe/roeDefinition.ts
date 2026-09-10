import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const roeDefinition: MetricDefinitionSpec = {
  metricCode: 'roe',
  displayName: '股東權益報酬率 (ROE)',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季淨利/本季期末權益*100，淨利/權益優先採歸屬於母公司口徑，缺漏退回整體口徑；' +
    'Q_ANN = Q*4（簡易年化，非複利）；TTM = 近四季（含本季）淨利加總/本季期末權益*100，' +
    '四季不齊為 null（null_reason=insufficient_history）。這是獨立於 src/domainMetrics/roe.ts ' +
    '的重新實作（src/domainPitMetrics/profitability/roe/computeRoePit.ts），兩者理論上算出相同數字，差異即代表其中一份有 bug。',
  // \% 在 LaTeX 是註解字元的跳脫寫法，compute-engine 的 LaTeX 剖析器不認得，會把
  // 「\times 100\%」整段悄悄吃掉（2026-09-10 實測驗證過，output 完全沒有 ×100，不是
  // 拋錯，是靜默錯誤）——不要在 formulaLatex 裡用 \%，單位已經有獨立的 unit 欄位負責，
  // 公式本身只留 \times 100 這個純數字係數。
  formulaLatex: '\\mathrm{ROE} = \\frac{\\mathrm{NetIncome}}{\\mathrm{Equity}} \\times 100',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%82%A1%E6%9D%B1%E6%AC%8A%E7%9B%8A%E5%A0%B1%E9%85%AC%E7%8E%87',
  tier: 'derived',
  group: 'period',
  allowedPeriodTypes: ['Q', 'Q_ANN', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 1,
};
