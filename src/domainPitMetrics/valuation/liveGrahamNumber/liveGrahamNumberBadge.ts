import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// 沿用 grahamNumberBadge 的門檻/說明文字（同一個公式、同一個 22.5 常數），差別只在
// token 是 'EOD'（逐日）不是 'TTM'（季報型 token）——badge 本身描述的是公式跟門檻，
// 跟股價來源（即時 vs 財報公告日）無關，不需要另外改寫 detail。
export const liveGrahamNumberBadge: MetricBadge = {
  id: 'live-graham-number',
  name: 'Graham Number（即時）',
  nameEn: 'Graham Number (Live)',
  author: 'Benjamin Graham, 1949',
  summary: '本益比 × 股價淨值比的即時版本，基本面用最新已申報財報，股價用當下最新收盤價，每個交易日更新。',
  detail:
    '跟季報型 grahamNumber 是同一個公式（PER×PBR，22.5 常數見 grahamNumber 說明），差別在股價來源：' +
    'grahamNumber 的股價凍結在財報公告當天，liveGrahamNumber 改用當下最新收盤價，基本面（EPS/BVPS）仍是' +
    '最新已申報的財報資料，只有股價會隨每個交易日變動。適合用來看「以現在的股價」重新評估這個估值角度，' +
    '跟 grahamNumber 是刻意並存、互不影響的兩支獨立指標，不要混用或互相驗證。',
  token: 'EOD',
  threshold: {
    description: '< 22.5',
    thresholdLatex: '\\mathrm{LiveGrahamNumber} < 22.5',
    note: 'Graham 本人設定的本益比 15 倍 × 股價淨值比 1.5 倍上限（15 × 1.5 = 22.5）',
    denominator: 1,
    comparator: 'lt',
    value: 22.5,
  },
};
