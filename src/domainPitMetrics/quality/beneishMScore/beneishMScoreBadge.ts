import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

export const beneishMScoreBadge: MetricBadge = {
  name: 'Beneish M-Score',
  nameEn: 'Beneish M-Score',
  author: 'Messod Beneish, 1999',
  summary: '結合 8 個會計比率的模型，用來偵測財報是否存在盈餘操縱的跡象。',
  detail:
    '印第安納大學會計學教授 Messod Beneish 於 1999 年發表，設計初衷是偵測財報上常見的盈餘操縱手法' +
    '（例如提前認列營收、虛增應收帳款）。模型結合應收帳款成長率、毛利率變化、資產品質變化、營收成長率、' +
    '折舊政策變化、銷管費用變化、財務槓桿變化、應計項目等 8 個會計比率，加權計算出一個綜合分數。分數本身' +
    '是統計模型對「財報數字是否出現操縱跡象常見的異常模式」的量化呈現，不等於已認定財報造假。',
  token: 'Q',
  threshold: { description: '< -1.78', thresholdLatex: '\\mathrm{M} < -1.78', note: 'Beneish 原始論文劃定的疑似操縱門檻', denominator: 1, comparator: 'lt', value: -1.78 },
};
