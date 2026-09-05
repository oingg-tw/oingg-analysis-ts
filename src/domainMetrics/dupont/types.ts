import type { Season } from '@/shared/rocQuarter';
import type { MetricStatus } from '@/shared/metricStatus';

export interface DupontQuery {
  symbol: string;
  // year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
  // （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  // 解析出來的季度會以固定值傳給 margins/turnoverRatio/roe 三支底層服務，不會讓它們各自再重複解析一次。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface DupontResult {
  symbol: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // 3 步杜邦分析：ROE = 淨利率 x 總資產週轉率 x 權益乘數。
  // 淨利率、總資產週轉率直接引用 margins/、turnoverRatio/ 已經算好的值，不重複查詢。
  netProfitMarginQuarterly: number | null; // %，引用自 margins/ 的 netProfitMarginQuarterly
  netProfitMarginTtm: number | null; // %，引用自 margins/ 的 netProfitMarginTtm
  assetTurnoverQuarterly: number | null; // 次，引用自 turnoverRatio/ 的 assetTurnoverQuarterly
  assetTurnoverTtm: number | null; // 次，引用自 turnoverRatio/ 的 assetTurnoverTtm
  // 權益乘數 = 總資產 / 權益，純資產負債表時點快照，單季/TTM 共用同一個值
  // （跟 ROE 用期末權益、不分單季/TTM 的道理一樣）。
  equityMultiplier: number | null;

  // 用上面三個因子重新相乘組裝出來的 ROE，理論上應該等於（或極接近）roe/ 直接算出來的值——
  // 兩者對照著看，可以互相驗證杜邦拆解跟 ROE 計算邏輯有沒有一致，小數點誤差是四捨五入造成的正常現象。
  decomposedRoeQuarterlyPct: number | null;
  decomposedRoeTtmPct: number | null;
  actualRoeQuarterlyPct: number | null; // 引用自 roe/ 的 roeQuarterlyPct，供對照
  actualRoeTtmPct: number | null; // 引用自 roe/ 的 roeTtmPct，供對照

  totalAssets: {
    value: string | null; // BigInt as string；本季期末總資產
  };
  equity: {
    fieldUsed: 'equityAttributableToParent' | 'totalEquity' | null;
    value: string | null; // BigInt as string；本季期末權益
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
