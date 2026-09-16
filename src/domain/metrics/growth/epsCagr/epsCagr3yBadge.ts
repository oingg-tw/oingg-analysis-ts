import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// William O'Neil CANSLIM 系統的「A」（Annual Earnings Growth）：過去 3 年年化 EPS 成長率
// 至少 25%，跟「C」（當季 EPS 年增率 ≥25%，見 epsGrowthRateBadge.ts）是同一套系統裡互補
// 的兩條規則——C 看的是「這一季有沒有突然加速」，A 看的是「過去幾年是不是持續高成長，不是
// 曇花一現」。O'Neil 原始篩選同時要求 ROE ≥17%，這裡只掛 EPS 成長這一半（門檻系統無法
// 表達「兩個不同指標各自的門檻同時達成」）。
export const epsCagr3yBadge: MetricBadge = {
  name: "O'Neil 年度盈餘成長",
  nameEn: "O'Neil Annual Earnings Growth",
  author: "William O'Neil",
  summary: '過去 3 年 EPS 年化複合成長率達 25% 以上，符合 CANSLIM 選股系統「A」的門檻。',
  detail:
    'William O’Neil 在《How to Make Money in Stocks》CANSLIM 系統的「A」（Annual' +
    ' Earnings Growth）：過去 3 年 EPS 年化複合成長率至少 25%，用意是排除只有單一季獲利' +
    '暴衝、缺乏持續性的公司，確認高成長是趨勢不是曇花一現。原始篩選同時要求股東權益報酬率' +
    '（ROE）至少 17%，這裡只涵蓋 EPS 成長這一半條件。',
  timeframe: 'FY',
  threshold: { description: '≥ 25%', thresholdLatex: '\\mathrm{EpsCagr}_{3y} \\geq 25', note: "CANSLIM 系統「A」的基準門檻，原始篩選同時要求 ROE≥17%，這裡只涵蓋 EPS 成長這一半", denominator: 1, comparator: 'gte', value: 25 },
};
