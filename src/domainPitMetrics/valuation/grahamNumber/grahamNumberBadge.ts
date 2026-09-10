import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

export const grahamNumberBadge: MetricBadge = {
  id: 'graham-number',
  name: 'Graham Number',
  nameEn: 'Graham Number',
  author: 'Benjamin Graham, 1949',
  summary: '用每股盈餘與每股淨值估算的一個保守估值上限參考值。',
  detail:
    '價值投資之父 Benjamin Graham 在其著作中提出的簡化估值公式，計算方式為「每股盈餘 × 每股淨值 × 22.5」' +
    '開根號。22.5 這個常數來自 Graham 自己設定的兩個上限：本益比不超過 15 倍、股價淨值比不超過 1.5 倍' +
    '（15 × 1.5 = 22.5）。這個數字原始用途是作為一個保守的估值參考上限，幫助篩選相對於獲利與帳面資產而言' +
    '股價偏低的公司，是 Graham 個人投資哲學下的簡化公式。',
  token: 'TTM',
  threshold: {
    description: '股價 < Graham Number（Graham 本人的比較慣例）',
    denominator: 1,
    comparator: 'lt',
    compareAgainstFieldId: 'stockPrice.Q',
  },
};
