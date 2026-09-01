import twsePrisma from '@/adapters/prisma/twseClient';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import type { VolumeTop20Result, VolumeTop20Row } from './types';

interface RawVolumeTop20Row {
  symbol: string;
  rank: number;
  volume: bigint;
  transaction: bigint;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  dir: string | null;
  change: number | null;
}

// 集中市場成交量前 20 名——twse-ts 官方算好的排序跟漲跌，不是自己拿 daily_price 兩天資料
// 相減算的。2026-09-01 應使用者要求維持原樣不濾除 ETF/衍生性商品（跟其他排行不一樣），
// 直接回傳原始排名，只補公司名稱（不在 company_profile 的標的 companyName 會是 null）。
export const getVolumeTop20 = async (): Promise<VolumeTop20Result> => {
  const warnings: string[] = [];

  const latestDateRows = await twsePrisma.$queryRaw<{ trade_date: Date | null }[]>`
    SELECT MAX(trade_date) as trade_date FROM "export"."volume_top20"
  `;
  const tradeDate = latestDateRows[0]?.trade_date;
  if (!tradeDate) {
    warnings.push('查無成交量前20名資料。');
    return { tradeDate: '', rankings: [], warnings };
  }

  const rows = await twsePrisma.$queryRaw<RawVolumeTop20Row[]>`
    SELECT symbol, rank, volume, transaction, open, high, low, close, dir, change
    FROM "export"."volume_top20"
    WHERE trade_date = ${tradeDate}
    ORDER BY rank ASC
  `;

  const companyNames = await getCompanyNamesForSymbols(rows.map((row) => row.symbol));
  // open/high/low/close/change 是 DB 的 Decimal 欄位，$queryRaw 撈出來是 Decimal 物件不是
  // 原生 number，直接塞進 JSON.stringify 會變成字串，要用 Number() 轉。
  const toNumber = (value: number | null) => (value === null ? null : Number(value));
  const rankings: VolumeTop20Row[] = rows.map((row) => ({
    rank: row.rank,
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    volume: row.volume.toString(),
    transaction: row.transaction.toString(),
    open: toNumber(row.open),
    high: toNumber(row.high),
    low: toNumber(row.low),
    close: toNumber(row.close),
    dir: row.dir,
    change: toNumber(row.change),
  }));

  return { tradeDate: tradeDate.toISOString().slice(0, 10), rankings, warnings };
};
