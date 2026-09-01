export interface PriceLimitRangeRow {
  rank: number;
  symbol: string;
  companyName: string | null;
  limitUp: number | null;
  limitDown: number | null;
  limitRange: number | null;
  openingRefPrice: number | null;
  previousDayPrice: number | null;
  allowOddLotTrade: string | null;
}

export interface PriceLimitRangeResult {
  tradeDate: string;
  widest: PriceLimitRangeRow[]; // 漲跌停幅度最大前 20（rank_group='top'）
  narrowest: PriceLimitRangeRow[]; // 漲跌停幅度最小前 20（rank_group='bottom'）
  warnings: string[];
}
