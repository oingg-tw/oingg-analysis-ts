import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

export const altmanZPrimeScoreBadge: MetricBadge = {
  id: 'altman-z-prime-score',
  name: "Altman Z'-Score",
  nameEn: "Altman Z'-Score",
  author: 'Edward Altman, 1983',
  summary: '結合 5 個財務比率的加權模型，是 Altman Z-Score 針對非上市公司調整過的版本。',
  detail:
    '紐約大學金融學教授 Edward Altman 於 1983 年發表，是 1968 年原始 Altman Z-Score 的獨立改版——因為原版' +
    'X4（股票市值／負債帳面值）需要公開市場股價，非上市公司無法計算，這個版本把 X4 換成帳面權益／負債帳面值，' +
    '並重新校準全部 5 個係數，不是原版係數乘比例調整。將營運資金／總資產、保留盈餘／總資產、稅前息前淨利／' +
    '總資產、帳面權益／負債帳面值、營收／總資產這 5 個財務比率各自加權後加總，得出一個綜合分數，分數越低代表' +
    '模型認定的財務危機風險越高。這是一個統計模型，反映的是歷史樣本歸納出的風險關聯性。',
  token: 'TTM',
  threshold: { description: '> 2.9（Altman 1983 論文劃定的安全區下限）', denominator: 1, comparator: 'gt', value: 2.9 },
};
