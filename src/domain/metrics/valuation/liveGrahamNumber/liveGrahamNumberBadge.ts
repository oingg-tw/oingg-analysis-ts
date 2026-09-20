import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 使用者要求：前端目前只會顯示這一個徽章（季報型 grahamNumber 已經不掛
// badge），detail/summary 不要再用「跟季報型 grahamNumber 比較」這種對照寫法——使用者
// 只看得到這一個徽章，提另一個看不到的版本只會造成混淆。改成直接、獨立地說明這支指標
// 本身：公式沿用 Graham Number 原始定義，計算基礎明講是「今天」的即時股價 + 最新公布
// 財報的基本面數據。
export const liveGrahamNumberBadge: MetricBadge = {
  name: '葛拉漢倍數',
  nameEn: 'Graham Number',
  author: 'Benjamin Graham, 1949',
  // 2026-09-20 sourceUrl 實際 fetch 驗證：有完整公式，並逐字寫出 The product of these two maximum multiples is 15 x 1.5 = 22.5。
  sourceUrl: 'https://en.wikipedia.org/wiki/Graham_number',
  summary: '本益比 × 股價淨值比，用今天的即時股價搭配最新公布財報的基本面數據計算，每個交易日更新。',
  detail:
    '價值投資之父 Benjamin Graham 在其著作中提出的簡化估值公式，原始構想是為每股盈餘與每股淨值設定' +
    '一組保守上限。22.5 這個常數來自 Graham 自己設定的兩個上限：本益比不超過 15 倍、股價淨值比不超過' +
    ' 1.5 倍（15 × 1.5 = 22.5）。這裡直接計算「本益比 × 股價淨值比」，跟 22.5 這個門檻比較，是數學上' +
    '等價、但不需要額外比較變量的寫法。計算基礎是「今天」的即時收盤價，搭配公司最新公布財報的 EPS/' +
    '每股淨值，每個交易日都會隨股價變動更新，反映以當下價格重新評估的結果。',
  timeframe: 'EOD',
  threshold: {
    description: '< 22.5',
    thresholdLatex: '\\mathrm{LiveGrahamNumber} < 22.5',
    note: 'Graham 本人設定的本益比 15 倍 × 股價淨值比 1.5 倍上限（15 × 1.5 = 22.5）',
    denominator: 1,
    comparator: 'lt',
    value: 22.5,
  },
};
