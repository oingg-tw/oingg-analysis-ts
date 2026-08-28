import type { Season } from '@/shared/rocQuarter';
import type { MetricStatus } from '@/shared/metricStatus';

export interface PiotroskiFScoreQuery {
  companyId: string;
  // year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的
  // 最新一季（見 shared/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  // 這裡的自動解析只決定「本季」，YoY 比較用的「去年同季」邏輯不受影響，照常用 getPastNQuarters 往前推。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface PiotroskiSignal {
  key: string;
  name: string;
  passed: boolean | null; // null = 這一項因為資料缺漏無法判斷
}

export interface PiotroskiFScoreResult {
  companyId: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // 9 項二元訊號加總（0~9）。**9 項全部能判斷才給分數**——任一項因為資料缺漏變成 null，
  // score 就是 null（不會用「9 項裡有幾項算出來」湊一個打折的分數），見 signals 找出是哪一項卡住。
  score: number | null;
  maxScore: 9;
  signals: PiotroskiSignal[];

  // 拿來跟本季比較的「去年同季」，用 getPastNQuarters 往前推 4 季定位，不是「上一季」。
  priorYear: string | null;
  priorSeason: Season | null;
  priorReportDate: string | null;

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
