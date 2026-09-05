import type { Season } from '@/shared/rocQuarter';
import type { MetricResultMeta } from '@/shared/metricStatus';
import type { QuarterlyMetricQuery, QuarterlyMetricIdentity } from '@/shared/quarterlyMetric';

// year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的
// 最新一季（見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
// 這裡的自動解析只決定「本季」，YoY 比較用的「去年同季」邏輯不受影響，照常用 getPastNQuarters 往前推。
export type PiotroskiFScoreQuery = QuarterlyMetricQuery;

export interface PiotroskiSignal {
  key: string;
  name: string;
  passed: boolean | null; // null = 這一項因為資料缺漏無法判斷
}

export interface PiotroskiFScoreResult extends QuarterlyMetricIdentity, MetricResultMeta {
  // 9 項二元訊號加總（0~9）。**9 項全部能判斷才給分數**——任一項因為資料缺漏變成 null，
  // score 就是 null（不會用「9 項裡有幾項算出來」湊一個打折的分數），見 signals 找出是哪一項卡住。
  score: number | null;
  maxScore: 9;
  signals: PiotroskiSignal[];

  // 拿來跟本季比較的「去年同季」，用 getPastNQuarters 往前推 4 季定位，不是「上一季」。
  priorYear: string | null;
  priorSeason: Season | null;
  priorReportDate: string | null;
}
