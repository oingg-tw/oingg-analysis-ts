import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-19 使用者決定：Piotroski F-Score 合併回「一個指標、一個徽章」，跟其餘徽章走同一套
// 通用門檻判定（GET /companies/badges 直接算出 passed），不再是「描述性文字、沒有門檻、
// 由前端拆成 3 個子徽章各自算子分數」的特例。
//
// 門檻用 Piotroski (2000) 原始論文自己的定義：論文把 F_SCORE 8 或 9 分歸為「高分」
// （high F_SCORE firms），0 或 1 分歸為「低分」，實證報酬差異就是拿這兩組比出來的——所以
// 通過門檻是 FScore >= 8，這是可以直接引用出處的數字，不是自己挑的。這個門檻用通用的
// comparator/value（gte / 8）就表達得了；先前註解說「N 選 M 無法用通用比較詞彙表達」，
// 指的是 2026-09-11 那個「3 組子徽章各自要有各自門檻」的設計，單一徽章沒有這個問題。
// denominator=9 保留：前端顯示「8 / 9」這種分數格式時用，語意跟 metricDefinitionSpec.ts
// 當初保留這個欄位時預想的「N 選 M」一致。
//
// 9 個訊號各自通過與否的明細仍由 GET /companies/piotroski-breakdown 提供（那是這個徽章的
// 「展開看細節」，不是另一組徽章）。
export const piotroskiFScoreBadge: MetricBadge = {
  name: 'Piotroski F-Score',
  nameEn: 'Piotroski F-Score',
  author: 'Joseph Piotroski, 2000',
  // 2026-09-20 sourceUrl 實際 fetch 驗證：有完整九項訊號的計分方法，並逐字寫出 F-score of 8-9 is considered to be strong。
  sourceUrl: 'https://en.wikipedia.org/wiki/Piotroski_F-score',
  summary: '用 9 個二元財務訊號衡量公司財務體質改善程度的綜合評分，8 分以上代表多數訊號同時轉好。',
  detail:
    '芝加哥大學會計學教授 Joseph Piotroski（現任教於史丹佛大學）於 2000 年發表的論文，設計' +
    '出 9 個二元（是/否）財務訊號，分成三組：獲利能力（ROA 為正、營業現金流為正、ROA 較去年' +
    '同季提升、營業現金流大於淨利）、財務槓桿與流動性（長期負債比率下降、流動比率提升、' +
    '流通股數未增加）、營運效率（毛利率提升、總資產週轉率提升），每項符合記 1 分，加總得出' +
    '0-9 分的綜合評分。論文把 8 或 9 分定義為「高分」、0 或 1 分定義為「低分」，並發現在' +
    '1976–1996 年美國高帳面市值比股票樣本中，高分組買進後一年的市場調整報酬平均比低分組高' +
    '約 23 個百分點（Piotroski, 2000）——這個徽章的通過門檻就是論文的高分定義（8 分以上），' +
    '這是歷史樣本的統計結果，不是對未來報酬的保證。9 項訊號各自的通過情況可查' +
    ' GET /companies/piotroski-breakdown。',
  timeframe: 'Q',
  threshold: {
    description: '≥ 8',
    thresholdLatex: '\\mathrm{FScore} \\geq 8',
    note: 'Piotroski (2000) 原始論文把 8–9 分定義為高分（high F_SCORE），0–1 分定義為低分；9 項訊號需全部可判斷才有分數',
    denominator: 9,
    comparator: 'gte',
    value: 8,
  },
};
