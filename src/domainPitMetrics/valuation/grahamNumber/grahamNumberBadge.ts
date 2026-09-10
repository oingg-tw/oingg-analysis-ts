import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

export const grahamNumberBadge: MetricBadge = {
  id: 'graham-number',
  name: 'Graham Number',
  nameEn: 'Graham Number',
  author: 'Benjamin Graham, 1949',
  summary: '本益比 × 股價淨值比，衡量價格相對於獲利與帳面資產而言是否偏低的一個保守估值篩選。',
  detail:
    '價值投資之父 Benjamin Graham 在其著作中提出的簡化估值公式，原始構想是為每股盈餘與每股淨值設定' +
    '一組保守上限。22.5 這個常數來自 Graham 自己設定的兩個上限：本益比不超過 15 倍、股價淨值比不超過' +
    ' 1.5 倍（15 × 1.5 = 22.5）。這裡直接計算「本益比 × 股價淨值比」，跟 22.5 這個門檻比較，是數學上' +
    '等價、但不需要額外比較變量的寫法。這個數字原始用途是作為一個保守的估值參考上限，幫助篩選相對於' +
    '獲利與帳面資產而言價格偏低的公司，是 Graham 個人投資哲學下的簡化公式。',
  token: 'TTM',
  threshold: {
    description: '< 22.5',
    thresholdLatex: '\\mathrm{GrahamNumber} < 22.5',
    note: 'Graham 本人設定的本益比 15 倍 × 股價淨值比 1.5 倍上限（15 × 1.5 = 22.5）',
    denominator: 1,
    comparator: 'lt',
    value: 22.5,
  },
};
