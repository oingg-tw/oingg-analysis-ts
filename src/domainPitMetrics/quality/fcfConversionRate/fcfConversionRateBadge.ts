import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// FCF 轉換率（FCF/淨利）業界公認的品質門檻——多份財務教育/顧問資源交叉引用一致：
// Wall Street Prep、Corporate Finance Institute 等皆指出 ≥80% 視為優良、接近或
// 超過100%代表帳面獲利幾乎全數轉換成實際現金，是常被稱為「最重要的單一獲利品質指標」
// （盈餘可以靠應計/折舊政策/認列時點操縱，現金流較難操縱）。這不是單一學術論文提出的
// 精確數字，是業界顧問/投資銀行分析慣例廣泛採用的門檻，符合[[feedback_badge_must_have_real_name]]
// 「出處真實可查、門檻有依據」的放寬後標準。
export const fcfConversionRateBadge: MetricBadge = {
  name: 'FCF 轉換率門檻',
  nameEn: 'Free Cash Flow Conversion',
  author: 'Wall Street Prep / Corporate Finance Institute（業界分析慣例）',
  summary: '自由現金流佔淨利的比例達到業界公認的優良水準，代表帳面獲利有紮實的現金支撐。',
  detail:
    '「FCF 轉換率」衡量一家公司把帳面獲利實際轉換成自由現金流的能力（自由現金流 ÷ 淨利），' +
    '是股權研究與信用分析常用的獲利品質指標——盈餘可以透過應計項目、折舊政策、營收認列時點' +
    '等會計選擇調整，但現金流較難被這樣操縱，因此 FCF 轉換率被許多財務顧問資源（例如 Wall ' +
    'Street Prep、Corporate Finance Institute）稱為「最重要的單一獲利品質指標」。業界慣例' +
    '認為 ≥80% 屬於優良水準（穩定維持 90% 以上的公司鮮少爆雷），≥100% 則代表帳面獲利幾乎' +
    '全數兌現成現金，甚至因為折舊費用等非現金項目而超過 100%。這不是單一學術論文訂出的' +
    '精確數字，是投資銀行/顧問業界分析慣例廣泛採用的門檻。',
  timeframe: 'TTM',
  threshold: {
    description: '≥ 80%',
    thresholdLatex: '\\mathrm{FcfConversionRate} \\geq 80',
    note: '業界分析慣例常用的優良門檻（≥100% 代表帳面獲利完全兌現成現金），非單一學術論文的精確數字',
    denominator: 1,
    comparator: 'gte',
    value: 80,
  },
};
