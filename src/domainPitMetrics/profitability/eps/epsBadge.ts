import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

export const epsBadge: MetricBadge = {
  id: 'sp500-earnings-eligibility',
  name: 'S&P 500 獲利資格門檻',
  nameEn: 'S&P 500 Earnings Eligibility Screen',
  author: 'S&P Dow Jones Indices',
  summary: '近四季獲利合計為正、且最近一季也為正，S&P 500 官方採用的獲利穩定性資格審查。',
  detail:
    'S&P Dow Jones Indices 在其公開發布的《S&P U.S. Indices Methodology》裡，明訂公司要被納入 S&P 500' +
    '指數，除了市值、流動性、公眾流通量等條件外，還必須同時符合兩個獲利門檻：最近一季 GAAP 稅後淨利為正，' +
    '且最近連續四季 GAAP 稅後淨利加總也為正。這不是用來衡量「獲利能力多強」的評分方法論，而是指數編製機構' +
    '自己用來篩掉獲利不穩定、可能虧損公司的資格審查——用意是排除帳面上靠一次性收益撐場面、但本業實際上' +
    '正在虧損或獲利極不穩定的公司。',
  threshold: {
    description: '近四季 EPS 合計為正，且最近一季 EPS 也為正',
    thresholdLatex: '\\mathrm{EPS}_{\\mathrm{TTM}} > 0,\\quad \\mathrm{EPS}_{\\mathrm{Q}} > 0',
    note: 'S&P 500 官方納入門檻',
    denominator: 1,
    allPositiveFieldIds: ['eps.TTM', 'eps.Q'],
  },
};
