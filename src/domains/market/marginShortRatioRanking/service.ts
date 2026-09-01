import twsePrisma from '@/adapters/prisma/twseClient';
import { getTwseCompanySymbolSet } from '@/shared/sourceData/companyProfile';
import type { MarginShortRatioRankingQuery, MarginShortRatioRankingResult, MarginShortRatioRow } from './types';

// 券資比排行——2026-09-01 應使用者要求新增。券資比 = 融券今日餘額 / 融資今日餘額，是籌碼面
// 「軋空/放空熱度」的常用指標，比值愈高代表放空的人相對融資買進的人愈多，籌碼愈集中在空方，
// 有機會出現軋空。融資餘額是 0 或 null 時無法計算比值（分母不能是 0），直接排除，不當成 0 或
// 無限大處理。
//
// 排除 ETF/衍生性商品（例如槓桿/反向 ETF）——這是主打上市公司證券的排行榜功能，不是全部有
// 融資融券資料的標的都要排進來，見 getTwseCompanySymbolSet 的說明。
export const calculateMarginShortRatioRanking = async (query: MarginShortRatioRankingQuery): Promise<MarginShortRatioRankingResult> => {
  const { limit } = query;
  const warnings: string[] = [];

  const latest = await twsePrisma.marginBalance.findFirst({ orderBy: { tradeDate: 'desc' }, select: { tradeDate: true } });
  if (!latest) {
    warnings.push('查無任何一天的 margin_balance 資料，無法計算券資比排行。');
    return { tradeDate: '', limit, rankings: [], warnings };
  }
  const tradeDate = latest.tradeDate;

  const [rows, companySymbols] = await Promise.all([
    twsePrisma.marginBalance.findMany({
      where: { tradeDate, marginTodayBalance: { gt: 0 }, shortTodayBalance: { not: null } },
      select: { symbol: true, marginTodayBalance: true, shortTodayBalance: true },
    }),
    getTwseCompanySymbolSet(),
  ]);

  const ratios = rows
    .filter((row) => companySymbols.has(row.symbol))
    .map((row) => ({
      symbol: row.symbol,
      marginTodayBalance: row.marginTodayBalance!,
      shortTodayBalance: row.shortTodayBalance!,
      ratio: (Number(row.shortTodayBalance) / Number(row.marginTodayBalance)) * 100,
    }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, limit);

  if (ratios.length === 0) {
    warnings.push(`${tradeDate.toISOString().slice(0, 10)} 查無融資餘額大於 0 且有融券餘額的公司，無法計算排行。`);
  }

  const rankings: MarginShortRatioRow[] = ratios.map((row, index) => ({
    rank: index + 1,
    symbol: row.symbol,
    shortToMarginRatioPct: Math.round(row.ratio * 100) / 100,
    marginTodayBalance: row.marginTodayBalance.toString(),
    shortTodayBalance: row.shortTodayBalance.toString(),
  }));

  return { tradeDate: tradeDate.toISOString().slice(0, 10), limit, rankings, warnings };
};
