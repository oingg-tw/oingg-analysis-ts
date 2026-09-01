export interface VolumeTop20Row {
  rank: number;
  symbol: string;
  companyName: string | null;
  volume: string; // BigInt 用字串傳遞
  transaction: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  dir: string | null; // '+' 漲 / '-' 跌 / '' 平盤，原始欄位直接透傳
  change: number | null;
}

export interface VolumeTop20Result {
  tradeDate: string;
  rankings: VolumeTop20Row[];
  warnings: string[];
}
