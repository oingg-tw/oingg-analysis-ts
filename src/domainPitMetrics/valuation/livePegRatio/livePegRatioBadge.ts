import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// 沿用 pegRatioBadge 的門檻/說明文字，差別只在 token 是 'EOD'（逐日）不是 'TTM'。
export const livePegRatioBadge: MetricBadge = {
  id: 'live-peg-ratio',
  name: '本益成長比',
  nameEn: 'PEG Ratio',
  author: 'Peter Lynch, 1989',
  summary: '本益成長比的即時版本，成長率用最新已申報財報，本益比的股價用當下最新收盤價，每個交易日更新。',
  detail:
    '跟季報型 pegRatio 是同一個公式（本益比 ÷ EPS 5 年複合成長率，Lynch 經驗法則見 pegRatio 說明），' +
    '差別在本益比的股價來源：pegRatio 的股價凍結在財報公告當天，livePegRatio 改用當下最新收盤價，成長率' +
    '仍用最新已申報的完整會計年度資料，只有股價會隨每個交易日變動。跟 pegRatio 是刻意並存、互不影響的' +
    '兩支獨立指標，不要混用或互相驗證。',
  token: 'EOD',
  threshold: {
    description: '< 1',
    thresholdLatex: '\\mathrm{LivePEG} < 1',
    note: 'Lynch 的經驗法則：PEG ≈ 1 大致代表合理定價，明顯低於 1 代表相對成長性而言股價偏低',
    denominator: 1,
    comparator: 'lt',
    value: 1,
  },
};
