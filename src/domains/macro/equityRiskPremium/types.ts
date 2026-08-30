import type { MetricStatus } from '@/shared/metricStatus';

export interface EquityRiskPremiumQuery {
  // 全部選填，格式 YYYY-MM；不給任一組就用「TAIEX 月底收盤與無風險利率都有資料」的完整重疊區間
  // 起訖（見文件建議：歷史法 ERP 應該用越長的樣本越好，不要預設短窗口）。
  startYear?: number;
  startMonth?: number;
  endYear?: number;
  endMonth?: number;
}

export interface EquityRiskPremiumResult {
  // 實際使用的窗口起訖（YYYY-MM）——如果有指定 start/end，但超出資料涵蓋範圍，會裁切到實際涵蓋範圍
  // 並在 warnings 說明；完全查無重疊資料則為 null。
  windowStart: string | null;
  windowEnd: string | null;

  months: number; // 窗口內「TAIEX 與無風險利率都有資料」的月數，報酬率樣本數 = months - 1

  // 全部是百分比數字（例如 5.80 代表 5.80%），不是小數。
  marketReturnGeometric: number | null; // TAIEX 年化幾何報酬率
  marketReturnArithmetic: number | null; // TAIEX 年化算術報酬率（月報酬率平均 * 12）
  avgRiskFreeRate: number | null; // 同期 10 年期公債次級市場殖利率平均

  erpGeometric: number | null; // marketReturnGeometric - avgRiskFreeRate
  erpArithmetic: number | null; // marketReturnArithmetic - avgRiskFreeRate

  requestedWindow: { startYear?: number; startMonth?: number; endYear?: number; endMonth?: number };
  // 有指定 start/end，但窗口被裁切到資料實際涵蓋範圍時為 true（跟 beta 的 fellBackFromRequestedDate 同一種模式）。
  clippedToAvailableData: boolean;

  dataCoverage: {
    taiexDateRange: { min: string | null; max: string | null }; // oingg-twse daily_taiex_index 整體月底收盤涵蓋範圍（跟 query 無關）
    riskFreeRateDateRange: { min: string | null; max: string | null }; // CBC monthly_gov_bond_yield_10y 整體涵蓋範圍
  };

  // 只列出值為 null 的欄位（marketReturnGeometric/marketReturnArithmetic/avgRiskFreeRate/erpGeometric/erpArithmetic），見 src/shared/metricStatus.ts。
  fieldStatuses: Record<string, MetricStatus>;

  warnings: string[];
}
