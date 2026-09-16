import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

export const sueBadge: MetricBadge = {
  name: '標準化未預期盈餘',
  nameEn: 'Standardized Unexpected Earnings',
  author: 'Foster, Olsen & Shevlin, 1984, Bernard & Thomas, 1989',
  summary: '本季盈餘意外程度的標準化分數，數值越高代表這季獲利遠超市場對「正常」的預期。',
  detail:
    'SUE 是「未預期盈餘」（UE，本季單季 EPS 減去去年同季單季 EPS）除以近 20 季 UE 的樣本標準差算出的' +
    '標準化分數，源自 Foster, Olsen & Shevlin 1984 年的原始研究，後由 Bernard & Thomas 1989 年的論文確立' +
    '為 PEAD（盈餘公告後漂移）文獻中最常引用的旗艦指標——他們發現財報公布後，SUE 越極端的股票，其超額' +
    '報酬在接下來數季會持續同方向漂移，而不是財報公布當下就立刻完全反映。這是一個統計上的異常現象，反映' +
    '市場對盈餘意外的反應存在延遲，不代表未來報酬保證延續此模式。',
  timeframe: 'Q',
  threshold: { description: '> 2', thresholdLatex: '\\mathrm{SUE} > 2', note: 'PEAD 文獻常用的顯著正向盈餘意外門檻', denominator: 1, comparator: 'gt', value: 2 },
};
