import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-10 web-nuxt 轉移過來的「大師徽章」資料，內容比照他們已合規審查過的版本，不是
// 自己重新推導。
export const altmanZScoreBadge: MetricBadge = {
  id: 'altman-z-score',
  name: 'Altman Z-Score',
  nameEn: 'Altman Z-Score',
  author: 'Edward Altman, 1968',
  summary: '結合 5 個財務比率的加權模型，最初用來預測企業破產風險。',
  detail:
    '紐約大學金融學教授 Edward Altman 於 1968 年發表，是財務危機預測領域最早、也最廣為引用的模型之一。' +
    '將營運資金／總資產、保留盈餘／總資產、稅前息前淨利／總資產、股票市值／負債帳面值、營收／總資產這 5 個' +
    '財務比率各自加權後加總，得出一個綜合分數，分數越低代表模型認定的財務危機風險越高。這是一個統計模型，' +
    '反映的是歷史樣本歸納出的風險關聯性。',
  token: 'TTM',
  threshold: { description: '> 2.99（Altman 原始論文劃定的安全區下限）', denominator: 1, comparator: 'gt', value: 2.99 },
};
