import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import type { VolumeTop20Result, VolumeTop20Row } from './types';

interface RawTwseVolumeTop20Row {
  symbol: string;
  volume: bigint;
  transaction: bigint;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  dir: string | null;
  change: number | null;
}

interface RawTpexVolumeTop20Row {
  symbol: string;
  volume: bigint;
}

interface PoolRow {
  market: 'TWSE' | 'TPEx';
  symbol: string;
  volume: bigint;
  transaction: bigint | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  dir: string | null;
  change: number | null;
}

// 成交量前 20 名——twse-ts/tpex-ts 給的是「各自市場」官方算好的前 20（不是全市場原始資料），
// 2026-09-01 應使用者要求合併成真正的「全市場前 20」：把兩邊的前 20 candidate pool（共最多
// 40 筆）合併後再依成交量重排、取前 20——因為兩邊給的已經是各自市場成交量最大的前 20，
// 合併後排出來的前 20 一定涵蓋真正的全市場前 20（標準的「合併已排序列表取前 N 名」邏輯），
// 不需要重新查整個市場的原始資料。
//
// TPEx 版本欄位比 TWSE 精簡很多（只有 symbol/trade_date/rank/volume），沒有的欄位（
// transaction/open/high/low/close/dir/change）回傳 null，不是查詢失敗。
//
// ⚠️ 沒有排除 ETF/衍生性商品（跟本服務其他主打「上市公司證券」的排行榜不一樣，2026-09-01
// 應使用者要求維持原樣，直接回傳兩邊官方排名合併後的結果）。
export const getVolumeTop20 = async (): Promise<VolumeTop20Result> => {
  const warnings: string[] = [];

  const [twseDateRows, tpexDateRows] = await Promise.all([
    twsePrisma.$queryRaw<{ trade_date: Date | null }[]>`SELECT MAX(trade_date) as trade_date FROM "export"."volume_top20"`,
    tpexExportPrisma.$queryRaw<{ trade_date: Date | null }[]>`SELECT MAX(trade_date) as trade_date FROM "export"."volume_top20"`,
  ]);
  const candidates = [twseDateRows[0]?.trade_date, tpexDateRows[0]?.trade_date].filter((d): d is Date => d != null);
  if (candidates.length === 0) {
    warnings.push('查無成交量前20名資料。');
    return { tradeDate: '', rankings: [], warnings };
  }
  const tradeDate = candidates.reduce((latest, current) => (current > latest ? current : latest));

  const [twseRows, tpexRows] = await Promise.all([
    twsePrisma.$queryRaw<RawTwseVolumeTop20Row[]>`
      SELECT symbol, volume, transaction, open, high, low, close, dir, change
      FROM "export"."volume_top20"
      WHERE trade_date = ${tradeDate}
    `,
    tpexExportPrisma.$queryRaw<RawTpexVolumeTop20Row[]>`
      SELECT symbol, volume
      FROM "export"."volume_top20"
      WHERE trade_date = ${tradeDate}
    `,
  ]);

  const pool: PoolRow[] = [
    ...twseRows.map((row): PoolRow => ({ market: 'TWSE', ...row })),
    ...tpexRows.map((row): PoolRow => ({ market: 'TPEx', symbol: row.symbol, volume: row.volume, transaction: null, open: null, high: null, low: null, close: null, dir: null, change: null })),
  ];

  const sorted = [...pool].sort((a, b) => (b.volume > a.volume ? 1 : b.volume < a.volume ? -1 : 0)).slice(0, 20);

  const companyNames = await getCompanyNamesForSymbols(sorted.map((row) => row.symbol));
  // open/high/low/close/change 是 DB 的 Decimal 欄位，$queryRaw 撈出來是 Decimal 物件不是
  // 原生 number，直接塞進 JSON.stringify 會變成字串，要用 Number() 轉。
  const toNumber = (value: number | null) => (value === null ? null : Number(value));
  const rankings: VolumeTop20Row[] = sorted.map((row, index) => ({
    rank: index + 1,
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    market: row.market,
    volume: row.volume.toString(),
    transaction: row.transaction === null ? null : row.transaction.toString(),
    open: toNumber(row.open),
    high: toNumber(row.high),
    low: toNumber(row.low),
    close: toNumber(row.close),
    dir: row.dir,
    change: toNumber(row.change),
  }));

  return { tradeDate: tradeDate.toISOString().slice(0, 10), rankings, warnings };
};
