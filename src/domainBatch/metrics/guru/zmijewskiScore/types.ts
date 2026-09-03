import type { Season } from '@/shared/rocQuarter';
import type { MetricStatus } from '@/shared/metricStatus';

export interface ZmijewskiScoreQuery {
  companyId: string;
  // year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
  // （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string;
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface ZmijewskiScoreResult {
  companyId: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // Mark Zmijewski（1984）Probit 財務危機預警模型：
  // X = -4.3 - 4.5*(NI_TTM/總資產) + 5.7*(總負債/總資產) - 0.004*(流動資產/流動負債)
  xScore: number | null;
  // probabilityOfDistress = Φ(X)，標準常態累積分布函數（Zmijewski 原始模型是 Probit，機率解讀
  // 比原始分數 X 本身更直覺）——X > 0 等同機率 > 0.5，都是「模型判斷財務危機風險較高」的訊號。
  probabilityOfDistress: number | null;
  // 門檻是原始論文定的，不是本服務自訂：probabilityOfDistress > 0.5（等同 xScore > 0）判斷為
  // 財務危機風險較高。
  flagged: boolean | null;

  netIncomeTtm: {
    fieldUsed: 'netIncomeAttributableToParent' | 'netIncome' | null;
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  totalAssets: { value: string | null };
  totalLiabilities: { value: string | null };
  currentAssets: { value: string | null };
  currentLiabilities: { value: string | null };

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
