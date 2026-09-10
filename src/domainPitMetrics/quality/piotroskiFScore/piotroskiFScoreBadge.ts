import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-11 web-nuxt 要求：Piotroski F-Score 的評分邏輯（9 訊號通過數加總，"clamp
// round(value) 8 或 9 都算通過" 這種非完美 9/9 也算通過的判斷）確實沒辦法用
// threshold.comparator/value 這套通用比較詞彙表達——這也是這支從最初的 badge 遷移
// 就被排除的原因（見 metricDefinitionSpec.ts 的 tier 欄位說明）。但 name/author/
// summary/detail 這些描述性文字沒有這個限制，web-nuxt 原本要為 3 個拆分的子徽章
// 各自手工維護一份文字說明，改成讀這裡統一維護，避免跟後端各自一份、內容/出處寫法
// 不同步。threshold 只填 description/thresholdLatex/denominator（denominator=9
// 就是 metricDefinitionSpec.ts 當初保留這個欄位時預想的「N 選 M」情境），刻意不填
// comparator/value——沒有單一可以泛化表達的數值門檻，web-nuxt 自己算 3 組子分數，
// 不吃這裡的門檻判定。
export const piotroskiFScoreBadge: MetricBadge = {
  id: 'piotroski-f-score',
  name: 'Piotroski F-Score',
  nameEn: 'Piotroski F-Score',
  author: 'Joseph Piotroski, 2000',
  summary: '用 9 個二元財務訊號衡量公司財務體質改善程度的綜合評分，分數越高代表改善訊號越多。',
  detail:
    '芝加哥大學會計學教授 Joseph Piotroski（現任教於史丹佛大學）於 2000 年發表的論文，設計' +
    '出 9 個二元（是/否）財務訊號，分成三組：獲利能力（ROA 為正、營業現金流為正、ROA 較去年' +
    '同季提升、營業現金流大於淨利）、財務槓桿與流動性（長期負債比率下降、流動比率提升、' +
    '流通股數未增加）、營運效率（毛利率提升、總資產週轉率提升），每項符合記 1 分，加總得出' +
    '0-9 分的綜合評分。Piotroski 原始研究發現，在帳面市值比偏高（傳統價值股）的股票池裡，' +
    '搭配這個評分篩選出高分股票，能顯著提升報酬表現——高分不是保證未來獲利，而是財務體質' +
    '正在改善的統計訊號。9 項訊號各自的通過情況（依原始論文的三組分類）可查另開的 ' +
    'GET /companies/piotroski-breakdown 端點，這裡的 threshold 只描述加總公式本身，' +
    '不表達通過/不通過的判定。',
  threshold: {
    description: '9 項二元訊號加總（0-9 分）',
    thresholdLatex: '\\mathrm{FScore} = \\sum_{i=1}^{9} \\mathrm{Signal}_i,\\quad \\mathrm{Signal}_i \\in \\{0,1\\}',
    note: '各訊號分組子分數請見 GET /companies/piotroski-breakdown；沒有單一可泛化表達的通過門檻，這裡不宣告 comparator/value',
    denominator: 9,
  },
};
