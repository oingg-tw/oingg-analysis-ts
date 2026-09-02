import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import { getCumulativeChangePercent, cumulativeChangePercentKey } from '@/shared/sourceData/priceChange';
import { parseDispositionTimes, parseReasonShortLabel, parseDispositionPeriod } from './parseReason';
import type { DisposedStocksQuery, DisposedStocksResult, DisposedStockRow } from './types';

const SIX_DAY_CHANGE_TRADING_DAYS = 6;

interface RawTwseDisposedStockRow {
  symbol: string;
  announce_date: Date;
  announcement_count: number | null;
  reason: string | null;
  disposition_period: string | null;
  disposition_measures: string | null;
  detail: string | null;
  link_information: string | null;
}

interface RawTpexDisposedStockRow {
  symbol: string;
  announce_date: Date;
  reason: string | null;
  disposition_period: string | null;
  detail: string | null;
}

interface PoolRow {
  market: 'TWSE' | 'TPEx';
  symbol: string;
  announce_date: Date;
  announcement_count: number | null;
  reason: string | null;
  disposition_period: string | null;
  disposition_measures: string | null;
  detail: string | null;
  link_information: string | null;
}

// 處置股票清單——2026-09-01 應使用者要求新增，之後又應要求合併上市（twse-ts）+ 上櫃
// （tpex-ts）。兩邊都已經濾掉權證只留真正公司，這裡不用再濾一次。稀疏資料（多數日子 0 筆
// 處置），不是排行榜，取最近公告的前 limit 筆（依公告日期由新到舊）——各自先取前 limit 筆
// （已經是各自依日期排序好的），合併候選池後再重排取前 limit 筆，這樣兩邊各自最近的
// limit 筆一定足夠湊出合併後真正的前 limit 筆，不用查全部歷史資料。
//
// TPEx 版本欄位比 TWSE 精簡（沒有 announcement_count/disposition_measures/
// link_information），沒有的欄位回傳 null，不是查詢失敗。
//
// 2026-09-02 應使用者要求，只保留真正的上市/上櫃公司——用 company_profile 是否登記為判斷
// 依據，比對子查詢直接寫進 SQL 的 WHERE（不是抓回來再用 JS 篩），避免 LIMIT 先切掉、篩選
// 後剩不到 limit 筆的問題，見 valuation/ranking 的 COMPANY_SYMBOL_SUBQUERY 同樣的考量。
//
// TWSE 這邊額外篩 source = 'COMPANY_PROFILE'，排除證券商登記等非交易性質的
// 'COMPANY_PROFILE_PUBLIC'（見 src/shared/sourceData/companyProfile.ts 的說明）；KY 股跟
// 興櫃都算真正公司，不篩掉。TPEx 沒有對應的非公司性質分類，維持原樣不加條件。
//
// sixDayChangePercent：以 announceDate 為基準日的近6個交易日累積漲跌幅（點對點，見
// priceChange.ts）——2026-09-02 應使用者要求新增，給「為什麼被列為處置」補價格脈絡。
//
// reasonTimes：從 reason 解析出的次數（見 parseReason.ts）——比照 attentionStocks 的
// criteriaDetails，但 reason 的句型比 criteria 雜很多（法條引用、無次數概念的處置原因等），
// 應使用者要求只抽次數這個數字。
//
// reasonShort：2026-09-02 應使用者要求，把 reason 裡引用的法條款次簡化成中文短標籤（例如
// 「本中心作業要點第四條第一項第一款」→「漲跌異常」），對照表見 parseReason.ts 的說明。
//
// dispositionStartDate/dispositionEndDate：2026-09-02 應使用者要求，把 dispositionPeriod
// 拆成兩個西元日期欄位（見 parseReason.ts 的 parseDispositionPeriod），dispositionPeriod
// 原始字串仍然保留。
export const listDisposedStocks = async (query: DisposedStocksQuery): Promise<DisposedStocksResult> => {
  const { limit } = query;
  const warnings: string[] = [];

  const [twseRows, tpexRows] = await Promise.all([
    twsePrisma.$queryRaw<RawTwseDisposedStockRow[]>`
      SELECT symbol, announce_date, announcement_count, reason, disposition_period, disposition_measures, detail, link_information
      FROM "export"."disposed_stock"
      WHERE symbol IN (SELECT symbol FROM "public"."company_profile" WHERE source = 'COMPANY_PROFILE')
      ORDER BY announce_date DESC
      LIMIT ${limit}
    `,
    tpexExportPrisma.$queryRaw<RawTpexDisposedStockRow[]>`
      SELECT symbol, announce_date, reason, disposition_period, detail
      FROM "export"."disposed_stock"
      WHERE symbol IN (SELECT symbol FROM "export"."company_profile")
      ORDER BY announce_date DESC
      LIMIT ${limit}
    `,
  ]);

  const pool: PoolRow[] = [
    ...twseRows.map((row): PoolRow => ({ market: 'TWSE', ...row })),
    ...tpexRows.map(
      (row): PoolRow => ({
        market: 'TPEx',
        symbol: row.symbol,
        announce_date: row.announce_date,
        announcement_count: null,
        reason: row.reason,
        disposition_period: row.disposition_period,
        disposition_measures: null,
        detail: row.detail,
        link_information: null,
      })
    ),
  ];

  const sorted = [...pool].sort((a, b) => b.announce_date.getTime() - a.announce_date.getTime()).slice(0, limit);

  if (sorted.length === 0) {
    warnings.push('查無處置股票資料。');
  }

  const [companyNames, sixDayChanges] = await Promise.all([
    getCompanyNamesForSymbols(sorted.map((row) => row.symbol)),
    getCumulativeChangePercent(
      sorted.map((row) => ({ symbol: row.symbol, market: row.market, asOfDate: row.announce_date })),
      SIX_DAY_CHANGE_TRADING_DAYS
    ),
  ]);
  const items: DisposedStockRow[] = sorted.map((row) => {
    const period = parseDispositionPeriod(row.disposition_period);
    return {
      symbol: row.symbol,
      companyName: companyNames.get(row.symbol) ?? null,
      market: row.market,
      announceDate: row.announce_date.toISOString().slice(0, 10),
      announcementCount: row.announcement_count,
      reason: row.reason,
      reasonTimes: parseDispositionTimes(row.reason),
      reasonShort: parseReasonShortLabel(row.reason),
      dispositionPeriod: row.disposition_period,
      dispositionStartDate: period?.startDate ?? null,
      dispositionEndDate: period?.endDate ?? null,
      dispositionMeasures: row.disposition_measures,
      detail: row.detail,
      linkInformation: row.link_information,
      sixDayChangePercent: sixDayChanges.get(cumulativeChangePercentKey(row.market, row.symbol, row.announce_date)) ?? null,
    };
  });

  return { limit, items, warnings };
};
