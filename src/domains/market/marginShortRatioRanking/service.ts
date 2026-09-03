import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getSecuritySymbolSet, getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import type { MarginShortRatioRankingQuery, MarginShortRatioRankingResult, MarginShortRatioRow } from './types';

interface RawMarginBalanceRow {
  symbol: string;
  margin_today_balance: bigint | null;
  short_today_balance: bigint | null;
}

interface RatioRow {
  market: 'TWSE' | 'TPEx';
  symbol: string;
  marginTodayBalance: bigint;
  shortTodayBalance: bigint;
  ratio: number;
}

// 券資比排行——2026-09-01 應使用者要求新增。券資比 = 融券今日餘額 / 融資今日餘額，是籌碼面
// 「軋空/放空熱度」的常用指標，比值愈高代表放空的人相對融資買進的人愈多，籌碼愈集中在空方，
// 有機會出現軋空。融資餘額是 0 或 null 時無法計算比值（分母不能是 0），直接排除，不當成 0 或
// 無限大處理。
//
// 排除 ETF/衍生性商品（例如槓桿/反向 ETF）——這是主打上市公司證券的排行榜功能，不是全部有
// 融資融券資料的標的都要排進來，見 src/shared/sourceData/companyProfile.ts 的
// getAllSecurityRows 說明。preferredStock: 'exclude' 維持這支排行原本的行為。
//
// 2026-09-04 應要求合併上櫃（tpex-ts 開了 export.margin_balance，source 是他們內部的
// tpex_mainboard_margin_balance）——兩個市場各自找自己的最新交易日，不是強迫用同一天（跟
// valuation/ranking/service.ts 同一個修法：export 資料新鮮度不保證同步，強迫同一天會讓比較舊
// 的那個市場整個消失）。tpex-ts 提醒這個 dataset 的 Cloud Scheduler 剛排上、22:10 觸發，這幾天
// 「當日新鮮度」還在觀察，這裡沒有另外檢查 export.ingestion_runs——沿用本服務其他市場資料
// 「直接取有資料的最新一天」的一貫作法，不對這個 dataset 特殊處理，之後穩定了也不用回頭改。
// 上櫃檔數（~920 檔）遠少於上市，合併排行時上市會自然佔多數，是市場規模差異，不是 bug。
const resolveTwseMarginDate = async (): Promise<Date | null> => {
  const rows = await twseExportPrisma.$queryRaw<{ trade_date: Date }[]>`SELECT trade_date FROM "export"."margin_balance" ORDER BY trade_date DESC LIMIT 1`;
  return rows[0]?.trade_date ?? null;
};

const resolveTpexMarginDate = async (): Promise<Date | null> => {
  const rows = await tpexExportPrisma.$queryRaw<{ trade_date: Date }[]>`SELECT trade_date FROM "export"."margin_balance" ORDER BY trade_date DESC LIMIT 1`;
  return rows[0]?.trade_date ?? null;
};

const queryTwseMargin = async (tradeDate: Date): Promise<RatioRow[]> => {
  const [rows, companySymbols] = await Promise.all([
    twseExportPrisma.$queryRaw<RawMarginBalanceRow[]>`
      SELECT symbol, margin_today_balance, short_today_balance FROM "export"."margin_balance"
      WHERE trade_date = ${tradeDate} AND margin_today_balance > 0 AND short_today_balance IS NOT NULL
    `,
    getSecuritySymbolSet({ market: 'TWSE', preferredStock: 'exclude' }),
  ]);
  return rows
    .filter((row) => companySymbols.has(row.symbol))
    .map((row) => ({
      market: 'TWSE' as const,
      symbol: row.symbol,
      marginTodayBalance: row.margin_today_balance!,
      shortTodayBalance: row.short_today_balance!,
      ratio: (Number(row.short_today_balance) / Number(row.margin_today_balance)) * 100,
    }));
};

const queryTpexMargin = async (tradeDate: Date): Promise<RatioRow[]> => {
  const [rows, companySymbols] = await Promise.all([
    tpexExportPrisma.$queryRaw<RawMarginBalanceRow[]>`
      SELECT symbol, margin_today_balance, short_today_balance FROM "export"."margin_balance"
      WHERE trade_date = ${tradeDate} AND margin_today_balance > 0 AND short_today_balance IS NOT NULL
    `,
    getSecuritySymbolSet({ market: 'TPEx', preferredStock: 'exclude' }),
  ]);
  return rows
    .filter((row) => companySymbols.has(row.symbol))
    .map((row) => ({
      market: 'TPEx' as const,
      symbol: row.symbol,
      marginTodayBalance: row.margin_today_balance!,
      shortTodayBalance: row.short_today_balance!,
      ratio: (Number(row.short_today_balance) / Number(row.margin_today_balance)) * 100,
    }));
};

export const calculateMarginShortRatioRanking = async (query: MarginShortRatioRankingQuery): Promise<MarginShortRatioRankingResult> => {
  const { limit } = query;
  const warnings: string[] = [];

  const [twseTradeDate, tpexTradeDate] = await Promise.all([resolveTwseMarginDate(), resolveTpexMarginDate()]);

  if (!twseTradeDate && !tpexTradeDate) {
    warnings.push('查無任何一天的 margin_balance 資料，無法計算券資比排行。');
    return { tradeDate: '', limit, rankings: [], warnings };
  }

  const [twseRatios, tpexRatios] = await Promise.all([
    twseTradeDate ? queryTwseMargin(twseTradeDate) : Promise.resolve([]),
    tpexTradeDate ? queryTpexMargin(tpexTradeDate) : Promise.resolve([]),
  ]);

  const resolvedDates = [twseTradeDate, tpexTradeDate].filter((d): d is Date => d !== null);
  const latestDate = resolvedDates.reduce((latest, d) => (d > latest ? d : latest));
  if (twseTradeDate && tpexTradeDate && twseTradeDate.getTime() !== tpexTradeDate.getTime()) {
    warnings.push(
      `上市（TWSE）跟上櫃（TPEx）目前不是同一個最新交易日——上市 ${twseTradeDate.toISOString().slice(0, 10)}、上櫃 ${tpexTradeDate.toISOString().slice(0, 10)}，兩邊各自用自己最新的交易日排行，不是同一天的比較。`
    );
  } else if (!twseTradeDate) {
    warnings.push('上市（TWSE）查無 margin_balance 資料，這次排行只有上櫃（TPEx）的公司。');
  } else if (!tpexTradeDate) {
    warnings.push('上櫃（TPEx）查無 margin_balance 資料，這次排行只有上市（TWSE）的公司。');
  }

  const ratios = [...twseRatios, ...tpexRatios].sort((a, b) => b.ratio - a.ratio).slice(0, limit);

  if (ratios.length === 0) {
    warnings.push('查無融資餘額大於 0 且有融券餘額的公司，無法計算排行。');
  }

  const companyNames = await getCompanyNamesForSymbols(ratios.map((row) => row.symbol));
  const rankings: MarginShortRatioRow[] = ratios.map((row, index) => ({
    rank: index + 1,
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    market: row.market,
    shortToMarginRatioPct: Math.round(row.ratio * 100) / 100,
    marginTodayBalance: row.marginTodayBalance.toString(),
    shortTodayBalance: row.shortTodayBalance.toString(),
  }));

  return { tradeDate: latestDate.toISOString().slice(0, 10), limit, rankings, warnings };
};
