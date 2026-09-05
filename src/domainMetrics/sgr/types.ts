import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity } from '@/shared/quarterlyMetric';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的最新一季
// （見 shared/sourceData/latestQuarter.ts，取 roe 跟 dividendPayoutRatio 兩支底層服務各自需要的表的聯集），
// 只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。解析出來的季度會以固定值傳給
// calculateRoe/calculateDividendPayoutRatio，不會讓它們各自再重複解析一次。
export type SgrQuery = QuarterlyMetricQuery;

export interface SgrResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // SGR 可持續成長率 = ROE(TTM) x (1 - 配息率(TTM))。直接引用 roe/、dividendPayoutRatio/ 已經算好的
  // roeTtmPct、payoutRatioTtm，不重複查詢——複合指標，只有 TTM 口徑（因為配息率本身只有 TTM 口徑）。
  sgrTtm: number | null;

  roeTtm: {
    value: number | null; // 引用自 GET /profitability/roe 的 roeTtmPct
  };
  payoutRatioTtm: {
    value: number | null; // 引用自 GET /profitability/dividend-payout-ratio 的 payoutRatioTtm
  };
}
