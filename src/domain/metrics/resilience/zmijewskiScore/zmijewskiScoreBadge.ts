import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

export const zmijewskiScoreBadge: MetricBadge = {
  name: 'Zmijewski Score',
  nameEn: 'Zmijewski Score',
  author: 'Mark Zmijewski, 1984',
  summary: '用機率模型評估財務困境可能性，聚焦資產報酬率、槓桿與流動性三個面向。',
  detail:
    '芝加哥大學會計學教授 Mark Zmijewski 於 1984 年發表，同樣是財務危機預測模型，採用機率單位迴歸' +
    '（probit model），聚焦在資產報酬率（ROA）、財務槓桿（負債／總資產）、流動性（流動資產／流動負債）' +
    '這 3 個核心比率上，計算出企業財務困境的機率。模型設計上刻意只用少數幾個核心比率，是為了在樣本外的' +
    '預測穩定度上做取捨。跟其他財務危機模型一樣，反映的是統計關聯性。',
  timeframe: 'TTM',
  threshold: { description: '< 0.5', thresholdLatex: '\\mathrm{X} < 0.5', note: '機率模型的標準判別界線', denominator: 1, comparator: 'lt', value: 0.5 },
};
