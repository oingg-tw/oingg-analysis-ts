import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// 「Quality of Earnings Ratio」（現金盈餘品質比率）= 營業活動現金流 ÷ 淨利，業界公認
// 門檻是 ≥1 倍——多份財務教育資源交叉引用一致（Wall Street Prep、Double Entry
// Bookkeeping 等），代表每一元帳面獲利至少有一元真實現金流入支撐，是查核/盡職調查
// 常用的獲利品質篩檢指標。2026-09-14 第一輪盤點時曾以「Mohanram G-Score 論文裡沒有
// 獨立命名的一條」為由否決過這個候選，但那是命名標準放寬（第三輪）之前的判斷——現在
// 標準已改成「出處真實可查即可，不強制品牌詞」，這次查到的獨立來源交叉引用一致，
// 符合放寬後的標準，見[[feedback_badge_must_have_real_name]]。
export const ocfToNetIncomeBadge: MetricBadge = {
  name: '現金盈餘品質比率',
  nameEn: 'Quality of Earnings Ratio',
  author: '財務盡職調查業界慣例（Wall Street Prep / Double Entry Bookkeeping 等交叉引用）',
  summary: '營業活動現金流達到淨利的 1 倍以上，代表帳面獲利有真實現金流入支撐。',
  detail:
    '「Quality of Earnings Ratio」（現金盈餘品質比率）= 營業活動現金流 ÷ 淨利，是財務' +
    '盡職調查與股權分析常用的獲利品質篩檢指標：比率若明顯低於 1，代表帳面獲利主要靠應收' +
    '帳款增加、存貨堆積等尚未收現的會計項目撐出來；比率達到或超過 1，代表公司每賺一元' +
    '帳面淨利，至少有一元真實現金流入，獲利的「含金量」較高、較不容易被會計選擇操縱。' +
    '這個 1 倍門檻是財務顧問/盡職調查業界廣泛採用的經驗法則，不是單一學術論文訂出的' +
    '精確數字，跟已上線的斯隆應計項目比率（Sloan Accrual Ratio）是同一個現金 vs 應計' +
    '主題的互補指標，一個看「應計項目佔比」、一個看「現金流對淨利的覆蓋倍數」。',
  timeframe: 'TTM',
  threshold: {
    description: '≥ 1 倍',
    thresholdLatex: '\\mathrm{OcfToNetIncome} \\geq 1',
    note: '財務盡職調查/股權分析業界廣泛採用的經驗法則，非單一學術論文的精確數字',
    denominator: 1,
    comparator: 'gte',
    value: 1,
  },
};
