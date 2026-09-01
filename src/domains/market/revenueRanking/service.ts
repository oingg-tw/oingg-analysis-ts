import twsePrisma from '@/adapters/prisma/twseClient';
import { getTwseCompanySymbolSet, getTpexCompanySymbolSet, getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import type { RevenueRankingMetric, RevenueRankingQuery, RevenueRankingResult, RevenueRankingRow } from './types';

interface RawMonthlyRevenueRow {
  symbol: string;
  year_month: Date;
  current_month_revenue: bigint | null;
  mom_change_percent: number | null;
  yoy_change_percent: number | null;
}

// 月營收排行——2026-09-01 應使用者要求新增，metric 讓呼叫端指定要依哪個數字排序：
// yoy（年增率，最常見的「營收爆發」選股指標，跟基期比、排除季節性因素干擾）、
// mom（月增率，波動較大、容易受季節性因素影響，例如過年前後）、revenue（單季營收金額本身，
// 偏向大型權值股，沒有「成長」的意涵）。三種都做，不猜哪個是使用者真正想要的。
//
// monthly_revenue 的範圍是「公開發行公司」，不是只有上市櫃（dev 樣本看過 000xxx 開頭的代號），
// 應使用者要求只留上市（TWSE）或上櫃（TPEx）公司，見 getTwseCompanySymbolSet/
// getTpexCompanySymbolSet 的說明。
const METRIC_COLUMN: Record<RevenueRankingMetric, keyof RawMonthlyRevenueRow> = {
  yoy: 'yoy_change_percent',
  mom: 'mom_change_percent',
  revenue: 'current_month_revenue',
};

export const calculateRevenueRanking = async (query: RevenueRankingQuery): Promise<RevenueRankingResult> => {
  const { metric, order, limit } = query;
  const warnings: string[] = [];

  const latestMonthRows = await twsePrisma.$queryRaw<{ year_month: Date | null }[]>`
    SELECT MAX(year_month) as year_month FROM "export"."monthly_revenue"
  `;
  const yearMonth = latestMonthRows[0]?.year_month;
  if (!yearMonth) {
    warnings.push('查無任何月營收資料。');
    return { yearMonth: '', metric, order, limit, rankings: [], warnings };
  }

  const [rows, twseSymbols, tpexSymbols] = await Promise.all([
    twsePrisma.$queryRaw<RawMonthlyRevenueRow[]>`
      SELECT symbol, year_month, current_month_revenue, mom_change_percent, yoy_change_percent
      FROM "export"."monthly_revenue"
      WHERE year_month = ${yearMonth}
    `,
    getTwseCompanySymbolSet(),
    getTpexCompanySymbolSet(),
  ]);

  const column = METRIC_COLUMN[metric];
  const eligible = rows.filter((row) => (twseSymbols.has(row.symbol) || tpexSymbols.has(row.symbol)) && row[column] !== null);

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
  // mom/yoy_change_percent 是 DB 的 Decimal 欄位，$queryRaw 撈出來是 Decimal 物件不是原生
  // number（跟 Prisma model 查詢一樣），直接塞進 JSON.stringify 會變成字串，要用 Number() 轉。
  const rankings: RevenueRankingRow[] = sorted.map((row, index) => ({
    rank: index + 1,
    symbol: row.symbol,
    companyName: companyNames.get(row.symbol) ?? null,
    currentMonthRevenue: row.current_month_revenue?.toString() ?? null,
    momChangePercent: row.mom_change_percent === null ? null : Number(row.mom_change_percent),
    yoyChangePercent: row.yoy_change_percent === null ? null : Number(row.yoy_change_percent),
  }));

  return { yearMonth: yearMonth.toISOString().slice(0, 7), metric, order, limit, rankings, warnings };
};
