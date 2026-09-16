import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// Benjamin Graham《The Intelligent Investor》防禦型投資者七條規則之一：「Earnings
// Stability」——過去 10 年每年都有正獲利，不容許任何一年虧損。
export const consecutiveProfitYearsBadge: MetricBadge = {
  name: '獲利穩定性',
  nameEn: 'Earnings Stability',
  author: 'Benjamin Graham, 1949',
  summary: '過去 10 個完整會計年度每年都有正獲利，沒有任何一年虧損。',
  detail:
    'Benjamin Graham 在《The Intelligent Investor》為「防禦型投資者」訂出的七條選股規則之一' +
    '（獲利穩定測試）：公司過去 10 個完整會計年度必須每年都賺錢，只要有任何一年虧損就不合格。' +
    '這條規則的用意是篩掉獲利波動劇烈、抗景氣循環能力不足的公司，不追求成長速度，只要求' +
    '「穩定不虧」這個底線。',
  timeframe: 'FY',
  threshold: { description: '≥ 10 年', thresholdLatex: '\\mathrm{ConsecutiveProfitYears} \\geq 10', note: 'Graham 防禦型投資者獲利穩定測試的原始門檻，資料深度不足的公司會落在 insufficient_history 而非未達標', denominator: 1, comparator: 'gte', value: 10 },
};
