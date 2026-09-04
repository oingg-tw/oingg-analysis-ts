import type { MetricStatus } from '@/shared/metricStatus';

export interface MacdQuery {
  symbol: string;
  asOfDate?: string; // 選填，格式 YYYY-MM-DD；不給就抓「這家公司目前最新一筆股價」。
}

export interface MacdResult {
  symbol: string;
  asOfDate: string | null;

  // DIF = EMA(12) - EMA(26)；DEM（訊號線） = EMA(DIF, 9)；OSC = DIF - DEM。固定參數
  // (12, 26, 9)，taxonomy 沒有列其他參數組合。EMA 用 src/shared/technicalMath.ts 的
  // exponentialMovingAverageSeries，種子是前 N 筆的 SMA，資料筆數只比 26/9 多一點時數值
  // 還沒充分收斂，見 dataCoverage.emaConverged 的說明。
  dif: number | null;
  dem: number | null;
  osc: number | null;

  dataCoverage: {
    tradingDays: number;
    earliestDate: string | null;
    // EMA(26) 至少要 3 倍窗口（78 天）以上的歷史才算「充分收斂」，這是業界常見的粗略經驗法則，
    // 不是精確的數學門檻——資料量剛好等於門檻但不到 3 倍時，dif/dem/osc 還是會算出來，
    // 只是 warnings 會提醒「數值僅供參考」，不會因此回傳 null（跟資料量完全不足需要回傳 null
    // 是兩種不同情況，前者是「有值但精準度存疑」，後者是「連算都算不出來」）。
    emaConverged: boolean;
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
