import twsePrisma from '@/adapters/prisma/twseClient';

export interface PricePoint {
  tradeDate: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: bigint | null; // 成交股數
}

// 技術分析指標共用的日線序列查詢——抓 asOfDate（含）以前的全部歷史（依日期升冪排序），不像
// Beta 那樣先限定「N 年份」再篩選，因為技術指標的窗口長度差異很大（MA5D 到 MA200D），與其每個
// 指標各自決定要抓多少年份，不如讓呼叫端自己從回傳的陣列尾端取需要的長度。個股資料量目前最多
// 也就 5 年約 1200 筆（見種子公司），一次抓全部不是效能問題。
export const getPriceSeriesAsOf = async (symbol: string, asOfDate: Date): Promise<PricePoint[]> => {
  const rows = await twsePrisma.dailyPrice.findMany({
    where: { symbol, tradeDate: { lte: asOfDate } },
    orderBy: { tradeDate: 'asc' },
    select: { tradeDate: true, open: true, high: true, low: true, close: true, volume: true },
  });

  return rows.map((row) => ({
    tradeDate: row.tradeDate.toISOString().slice(0, 10),
    open: row.open !== null ? Number(row.open) : null,
    high: row.high !== null ? Number(row.high) : null,
    low: row.low !== null ? Number(row.low) : null,
    close: row.close !== null ? Number(row.close) : null,
    volume: row.volume,
  }));
};

export interface ResolvedPriceSeries {
  series: PricePoint[];
  // 實際使用的基準日——序列裡最新的一天（如果有指定 asOfDate，就是指定日期或之前最近的交易日）；
  // 完全查無資料則為 null。
  effectiveAsOf: string | null;
  // 有指定 asOfDate，但那天不是交易日（或還沒有資料），改用往前最近一個交易日代表。
  fellBackFromRequestedDate: boolean;
}

// 技術分析指標共用的「決定基準日、抓序列」邏輯——不指定 asOfDate 就抓「這家公司目前最新一筆
// 股價」，不是系統當下的日曆日期（當天可能還沒收盤、還沒有資料）；指定 asOfDate 但那天不是
// 交易日（例如週末），改用往前最近的交易日，並標記 fellBackFromRequestedDate，跟
// portfolio/beta/service.ts 的 effectiveAsOf 是同一種「以資料實際涵蓋範圍為準」的邏輯。
export const resolvePriceSeries = async (symbol: string, asOfDate?: string): Promise<ResolvedPriceSeries> => {
  const upperBound = asOfDate ? new Date(`${asOfDate}T00:00:00.000Z`) : new Date();
  const series = await getPriceSeriesAsOf(symbol, upperBound);

  if (series.length === 0) return { series, effectiveAsOf: null, fellBackFromRequestedDate: false };

  const effectiveAsOf = series[series.length - 1]!.tradeDate;
  return { series, effectiveAsOf, fellBackFromRequestedDate: asOfDate !== undefined && effectiveAsOf !== asOfDate };
};
