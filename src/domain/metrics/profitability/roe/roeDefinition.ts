import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-22 formulaVersion 2：分母改期間平均（Q = 本季與上季期末平均、TTM = 近四季窗口 5 個季末平均），理由與定義見
// application/metrics/shared/averageBalances.ts——期末分母在台股會因 6 月股東會決議股利轉列負債，讓每年 Q2 的 TTM 值假性跳升。
export const roeDefinition: MetricDefinitionSpec = {
  metricCode: 'roe',
  name: 'ROE',
  unit: '%',
  formulaNote:
    'Q(單季) = 本季淨利/平均權益*100，平均權益 = (本季期末 + 上季期末)/2，淨利/權益優先採歸屬於母公司口徑，缺漏退回整體口徑；' +
    'TTM = 近四季（含本季）淨利加總/平均權益*100，平均權益 = 近四季窗口 5 個季末（t−4 … t）權益的平均。' +
    '四季損益表或任一季末資產負債表不齊為 null（null_reason=insufficient_history）。' +
    '（formulaVersion 1（2026-09-22 前）分母是本季單一期末權益。）',
  // \% 在 LaTeX 是註解字元的跳脫寫法，compute-engine 的 LaTeX 剖析器不認得，會把
  // 「\times 100\%」整段悄悄吃掉（2026-09-10 實測驗證過，output 完全沒有 ×100，不是
  // 拋錯，是靜默錯誤）——不要在 formulaLatex 裡用 \%，單位已經有獨立的 unit 欄位負責，
  // 公式本身只留 \times 100 這個純數字係數。
  formulaLatex: '\\mathrm{ROE} = \\frac{\\mathrm{NetIncome}}{\\overline{\\mathrm{Equity}}} \\times 100',
  referenceUrl: 'https://zh.wikipedia.org/zh-tw/%E8%82%A1%E6%9D%B1%E6%AC%8A%E7%9B%8A%E5%A0%B1%E9%85%AC%E7%8E%87',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'equity_attributable_to_owners_of_parent', 'equity'],
  currentFormulaVersion: 2,
};
