import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getSecuritySymbolSet, getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import type { RevenueRankingMetric, RevenueRankingQuery, RevenueRankingResult, RevenueRankingRow } from './types';

interface RawMonthlyRevenueRow {
  symbol: string;
  year_month: Date;
  current_month_revenue: bigint | null;
  mom_change_percent: number | null;
  yoy_change_percent: number | null;
}

interface EligibleRow extends RawMonthlyRevenueRow {
  market: 'TWSE' | 'TPEx';
}

// 月營收排行——2026-09-01 應使用者要求新增，metric 讓呼叫端指定要依哪個數字排序：
// yoy（年增率，最常見的「營收爆發」選股指標，跟基期比、排除季節性因素干擾）、
// mom（月增率，波動較大、容易受季節性因素影響，例如過年前後）、revenue（單季營收金額本身，
// 偏向大型權值股，沒有「成長」的意涵）。三種都做，不猜哪個是使用者真正想要的。
//
// monthly_revenue 的範圍是「公開發行公司」，不是只有上市櫃（dev 樣本看過 000xxx 開頭的代號），
// 應使用者要求只留上市（TWSE）或上櫃（TPEx）公司，見 src/shared/sourceData/companyProfile.ts
// 的 getAllSecurityRows 說明。preferredStock: 'exclude' 維持這支排行原本的行為。
//
// 2026-09-01 tpex-ts 也開了自己的 monthly_revenue（欄位跟 TWSE 那份一致）——上市/上櫃各自
// 查詢、依 symbol 去重（同一家公司理論上不會兩邊都有，去重只是防呆，優先保留 TWSE 那筆），
// 合併後才依 metric 排序，不是只查 TWSE 那份，跟 /valuation/ranking 的合併邏輯同一種做法。
const METRIC_COLUMN: Record<RevenueRankingMetric, keyof RawMonthlyRevenueRow> = {
  yoy: 'yoy_change_percent',
  mom: 'mom_change_percent',
  revenue: 'current_month_revenue',
};

// yoy_change_percent 超過 300% 直接排除——2026-09-02 應使用者要求，這是「基期趨近於零」造成
// 的統計失真，不是真實的營運成長：分母（去年同月營收）趨近於零時，(今年-去年)/去年 會趨近
// 正無限大，例如聯上(4113) 去年同月營收只有 5.3 萬元、今年 5.8 億元，年增率算出 1,096,390%，
// 原始資料的 note 欄位甚至直接寫「不動產於過戶時點認列營收，故波動較大」，證實是認列時點
// 集中的產業特性，不是資料錯誤。這個扭曲只會發生在正的那一側（分母趨近零時比值趨近正無限
// 大；反過來分子趨近零時比值只會趨近 -100%，本身有界，不需要對稱處理負值）。
//
// 300% 這個門檻來自使用者提供的分析文件（見 docs/Revenue YoY Distortion Analysis.md）：
// 0~50% 高/極高參考價值、50~100% 中等（警訊）、100~300% 低（高度統計失真）、>300% 完全無
// 參考價值（偽指標）。文件建議更嚴謹的作法是比較「前期分母 vs 過去5年歷史中位數」，但
// monthly_revenue 目前只有單一個月的鏡像資料，還沒有多年歷史可以算，300% 固定門檻是第一版
// 簡化規則。只套用在 metric=yoy（這個問題是年增率基期特有的），不影響 mom/revenue 排行。
const YOY_DISTORTION_THRESHOLD_PERCENT = 300;

const getLatestYearMonth = async (): Promise<Date | null> => {
  const [twseRows, tpexRows] = await Promise.all([
    twsePrisma.$queryRaw<{ year_month: Date | null }[]>`SELECT MAX(year_month) as year_month FROM "export"."monthly_revenue"`,
    tpexExportPrisma.$queryRaw<{ year_month: Date | null }[]>`SELECT MAX(year_month) as year_month FROM "export"."monthly_revenue"`,
  ]);
  const candidates = [twseRows[0]?.year_month, tpexRows[0]?.year_month].filter((d): d is Date => d != null);
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, current) => (current > latest ? current : latest));
};

export const calculateRevenueRanking = async (query: RevenueRankingQuery): Promise<RevenueRankingResult> => {
  const { metric, order, limit } = query;
  const warnings: string[] = [];

  const yearMonth = await getLatestYearMonth();
  if (!yearMonth) {
    warnings.push('查無任何月營收資料。');
    return { yearMonth: '', metric, order, limit, rankings: [], warnings };
  }

  const [twseRows, tpexRows, twseSymbols, tpexSymbols] = await Promise.all([
    twsePrisma.$queryRaw<RawMonthlyRevenueRow[]>`
      SELECT symbol, year_month, current_month_revenue, mom_change_percent, yoy_change_percent
      FROM "export"."monthly_revenue"
      WHERE year_month = ${yearMonth}
    `,
    tpexExportPrisma.$queryRaw<RawMonthlyRevenueRow[]>`
      SELECT symbol, year_month, current_month_revenue, mom_change_percent, yoy_change_percent
      FROM "export"."monthly_revenue"
      WHERE year_month = ${yearMonth}
    `,
    getSecuritySymbolSet({ market: 'TWSE', preferredStock: 'exclude' }),
    getSecuritySymbolSet({ market: 'TPEx', preferredStock: 'exclude' }),
  ]);

  const bySymbol = new Map<string, EligibleRow>();
  for (const row of twseRows) bySymbol.set(row.symbol, { ...row, market: 'TWSE' });
  for (const row of tpexRows) if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, { ...row, market: 'TPEx' });

  const column = METRIC_COLUMN[metric];
  const eligible = [...bySymbol.values()].filter(
    (row) =>
      (twseSymbols.has(row.symbol) || tpexSymbols.has(row.symbol)) &&
      row[column] !== null &&
      !(metric === 'yoy' && row.yoy_change_percent !== null && row.yoy_change_percent > YOY_DISTORTION_THRESHOLD_PERCENT)
  );

  const sorted = [...eligible]
    .sort((a, b) => {
      const diff = Number(a[column]) - Number(b[column]);
      return order === 'asc' ? diff : -diff;
    })
    .slice(0, limit);

  if (sorted.length === 0) {
    warnings.push(`${yearMonth.toISOString().slice(0, 7)} 查無符合條件（上市或上櫃、${metric} 有值）的公司，無法排行。`);
  }

  const companyNames = await getCompanyNamesForSymbols(sorted.map((row) => row.symbol));
  const rankings: RevenueRankingRow[] = sorted.map((row, index) => ({
    rank: index + 1,
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    market: row.market,
    currentMonthRevenue: row.current_month_revenue?.toString() ?? null,
    momChangePercent: row.mom_change_percent === null ? null : Number(row.mom_change_percent),
    yoyChangePercent: row.yoy_change_percent === null ? null : Number(row.yoy_change_percent),
  }));

  return { yearMonth: yearMonth.toISOString().slice(0, 7), metric, order, limit, rankings, warnings };
};
