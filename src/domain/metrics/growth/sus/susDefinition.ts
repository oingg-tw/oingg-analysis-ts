import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// SUS（標準化未預期營收）——sue 的營收版。2026-09-23 新增，是本專案第一支**月頻**指標，資料落在獨立的
// metric_monthly_values（理由見 prisma/analysis/schema.prisma 的 MetricMonthlyValue 檔頭）。
//
// 出處：Jegadeesh & Livnat (2006)《Revenue Surprises and Stock Returns》，Journal of Accounting and
// Economics 41(1-2), 147-171。他們定義 SURGE（standardized unexpected revenue growth estimate）並發現
// **在控制住盈餘意外之後**，營收意外大的股票在公告後仍有顯著異常報酬——這正是 SUS 跟既有 sue 不重複的
// 理由，不是同一個訊號的兩種寫法。
//
// 為什麼不掛顧廣平（2010）「營收動能策略」（管理學報 27(3)）：那篇用的也是標準化未預期營收、是台灣本土
// 實證，但使用者不希望同一位學者掛太多支徽章（顧廣平先前已因此拆過一輪），所以作者掛原始提出者
// Jegadeesh & Livnat，顧廣平那篇當台灣採用實例放在徽章的 note——跟本專案既有的「author 只寫原始提出者、
// 台灣論文放 note」規則一致。
//
// 跟原文的兩處改編（誠實列出，不寫成「照原文定義」）：季→月（台灣月營收強制揭露是本地特有制度，季節
// 週期 4→12）、每股→金額（避開股本變動污染序列，同 sue 從 EPS 改用淨利金額的取捨）。詳見 calculateSus.ts。
export const susDefinition: MetricDefinitionSpec = {
  metricCode: 'sus',
  name: 'SUS',
  unit: '分',
  formulaNote:
    'SUS_t = (R_t − E(R_t)) / ξ，R 是單月營收金額；E(R_t) = R_{t−12} + drift（季節性隨機漫步加漂移項），' +
    'drift 是前 8 個季節差分 R_{t−j} − R_{t−j−12}（j=1..8）的平均，ξ 是同一組差分的樣本標準差' +
    '（Jegadeesh & Livnat 2006 的 SURGE；原文用每股季營收，這裡用單月營收金額）。' +
    '共需 21 個連續月份（t−20 至 t），任一月缺漏為 insufficient_history，不用更少期數頂替；' +
    'ξ = 0 為 zero_or_negative_denominator（過去 8 個季節差分完全相同，沒有尺規可量意外）。' +
    '只有月頻一種座標——本質是單月營收意外，沒有季或近四季的概念。',
  formulaLatex: '\\mathrm{SUS}_t = \\frac{R_t - (R_{t-12} + \\mu)}{\\xi}',
  academicSourceUrl: 'https://doi.org/10.1016/j.jacceco.2005.10.003',
  referenceUrl: 'https://en.wikipedia.org/wiki/Post%E2%80%93earnings-announcement_drift',
  tier: 'composite',
  sources: ['上市公司月營業收入彙總表（TWSE）', '上櫃公司月營業收入彙總表（TPEx）'],
  group: 'monthly',
  dependsOn: ['current_month_revenue'],
  currentFormulaVersion: 1,
};
