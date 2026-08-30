import type { MetricStatus } from '@/shared/metricStatus';

export interface ObvQuery {
  companyId: string;
  asOfDate?: string; // 選填，格式 YYYY-MM-DD；不給就抓「這家公司目前最新一筆股價」。
}

export interface ObvResult {
  companyId: string;
  asOfDate: string | null;

  // OBV（能量潮）：從 daily_price 目前收錄的最早一筆開始累加，收盤價比前一天高就加成交量、
  // 比前一天低就減成交量。這是「累積值」，不是某個固定天數視窗的指標，也沒有跨公司比較意義
  // （不同公司歷史起點不同），只有同一公司內看趨勢變化（創新高/創新低）才有意義。
  //
  // **taxonomy 的 VWAP_OBV 只做了 OBV，VWAP 本服務做不到**：真正的 VWAP（成交量加權平均價）
  // 需要當日盤中逐筆或分鐘 K 線資料才能算，daily_price 只有每天一筆的開高低收/總量，沒有
  // 盤中細節——這是結構性缺口，不是覆蓋率問題，不會隨資料累積而解決，所以不列這個欄位，
  // 不是漏做。
  obv: string | null; // BigInt as string；股數，可能是負數

  dataCoverage: {
    tradingDays: number;
    earliestDate: string | null;
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
