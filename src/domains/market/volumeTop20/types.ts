export interface VolumeTop20Row {
  rank: number;
  symbol: string;
  companyName: string | null;
  market: 'TWSE' | 'TPEx';
  volume: string; // BigInt 用字串傳遞
  transaction: string | null; // TPEx 版本沒有這個欄位，null
  open: number | null; // TPEx 版本沒有這個欄位，null
  high: number | null; // TPEx 版本沒有這個欄位，null
  low: number | null; // TPEx 版本沒有這個欄位，null
  close: number | null; // TPEx 版本沒有這個欄位，null
  dir: string | null; // '+' 漲 / '-' 跌 / '' 平盤，TPEx 版本沒有這個欄位，null
  change: number | null; // TPEx 版本沒有這個欄位，null
}

export interface VolumeTop20Result {
  tradeDate: string;
  rankings: VolumeTop20Row[];
  warnings: string[];
}
