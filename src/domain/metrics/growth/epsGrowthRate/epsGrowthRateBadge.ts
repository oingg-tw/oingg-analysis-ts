import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// William O'Neil《How to Make Money in Stocks》CANSLIM 系統的「C」（Current Quarterly
// Earnings）：當季 EPS 年增率至少 25%，是七個字母裡最廣為引用的門檻。O'Neil 統計過近八成
// 大飆股在噴出前最近一季 EPS 年增率都在這個門檻以上。
export const epsGrowthRateBadge: MetricBadge = {
  name: "O'Neil 當季盈餘成長",
  nameEn: "O'Neil Current Quarterly Earnings",
  author: "William O'Neil",
  // 2026-09-20 sourceUrl 實際 fetch 驗證：維基 CAN SLIM 條目逐字寫出「C」的門檻：current earnings should be up at least 25% in the most recent financial quarter。
  sourceUrl: 'https://en.wikipedia.org/wiki/CAN_SLIM',
  summary: '當季每股盈餘年增率達 25% 以上，符合 CANSLIM 選股系統「C」的門檻。',
  detail:
    'William O’Neil 在《How to Make Money in Stocks》提出的 CANSLIM 選股系統，「C」' +
    '（Current Quarterly Earnings）要求當季每股盈餘（EPS）比去年同季至少成長 25%。O’Neil' +
    '回測歷史大飆股發現，大多數股票在噴出上漲前的最近一季都有這個等級以上的獲利加速訊號，' +
    '牛市中最強勢的股票季增率經常遠高於 25%（40%、100% 甚至更高）。',
  timeframe: 'Q',
  threshold: { description: '≥ 25%', thresholdLatex: '\\mathrm{EpsGrowthRate} \\geq 25', note: "CANSLIM 系統「C」的基準門檻，O'Neil 認為牛市中最強勢的股票經常遠高於這個數字", denominator: 1, comparator: 'gte', value: 25 },
};
