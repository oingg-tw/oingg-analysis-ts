import type { Season } from '@/shared/rocQuarter';
import type { MetricStatus } from '@/shared/metricStatus';

export interface BeneishMScoreQuery {
  companyId: string;
  // year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的
  // 最新一季（見 shared/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  // 這裡的自動解析只決定「本季」，YoY 比較用的「去年同季」邏輯不受影響，照常用 getPastNQuarters 往前推。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface BeneishMScoreResult {
  companyId: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // M = -4.84 + 0.920*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI + 0.115*DEPI
  //     - 0.172*SGAI + 4.037*TATA + 0.0327*LVGI
  // 8 個變量任一為 null，mScore 就是 null（見 fieldStatuses 找出是哪一個變數卡住）。
  mScore: number | null;
  // M-Score > -1.78：財務造假/營收灌水風險較高；M-Score <= -1.78：財務數據可信度較高
  // （這是原始論文的判別門檻，不是本服務自訂的）。
  flagged: boolean | null;

  dsri: number | null; // 應收帳款指數
  gmi: number | null; // 毛利率指數
  aqi: number | null; // 資產品質指數（簡化版，沒有扣除有價證券，只扣流動資產+PPE）
  sgi: number | null; // 營收成長指數
  depi: number | null; // 折舊指數（只用 depreciation，不含 amortization）
  sgai: number | null; // 管銷費用指數（SGA = 推銷費用 + 管理費用）
  tata: number | null; // 總應計利潤對總資產比（不需要跟去年比較，單期指標）
  lvgi: number | null; // 槓桿指數（簡化版，用總負債/總資產，不是長期負債+流動負債的嚴格定義）

  // 拿來跟本季比較的「去年同季」，用 getPastNQuarters 往前推 4 季定位。
  priorYear: string | null;
  priorSeason: Season | null;
  priorReportDate: string | null;

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
