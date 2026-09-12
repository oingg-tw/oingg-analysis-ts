import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

export const ohlsonOScoreBadge: MetricBadge = {
  name: 'Ohlson O-Score',
  nameEn: 'Ohlson O-Score',
  author: 'James Ohlson, 1980',
  summary: '用邏輯迴歸模型估計企業陷入財務困境的機率。',
  detail:
    '紐約大學會計學教授 James Ohlson 於 1980 年發表，是財務危機預測領域除了 Altman Z-Score 外另一個常被' +
    '引用的模型。與 Z-Score 用加權加總的做法不同，O-Score 用邏輯迴歸（logistic regression）方式，將公司' +
    '規模、負債比、營運資金比率、流動比率、獲利能力、現金流量等 9 項財務因子代入模型，直接估計出一個' +
    '「陷入財務困境」的機率值。同樣是根據歷史樣本建立的統計模型，反映的是統計上的關聯性。',
  token: 'TTM',
  threshold: { description: '< 0.5', thresholdLatex: '\\mathrm{O} < 0.5', note: '機率模型的標準判別界線', denominator: 1, comparator: 'lt', value: 0.5 },
};
