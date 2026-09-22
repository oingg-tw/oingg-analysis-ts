import type { AppDeps } from '@/application/deps';
import type { UsdTwdInterval } from '@/application/ports/macroData';
import { toMonthPeriod, toQuarterPeriod } from './period';
import type { BusinessCycleResult, CpiResult, GdpResult, GovBondYield10yHistoryResult, MonetaryAggregateResult, StockMarketSummaryResult, UsdTwdRateResult } from './types';

// 2026-09-22 web-nuxt「總經特區」：側邊欄放各總經指標跟大盤對照。六支都是 gov-ts export view 的純轉發
// （bff 沒有 DB 直連，只有這條路；使用者拍板整批做），唯一的加工是把 (year, month)/(year, quarter) 組成
// period 字串（前端各自拼會各錯一次、還要跟 TAIEX 的 tradeDate 對齊）跟 `from` 過濾。刻意不做交叉計算
// （黃金交叉、燈號轉折）——那是判斷，前端只畫線讓讀者自己看；也刻意不進 GET /metrics 目錄（公司指標
// 的目錄，塞總經序列會污染篩選欄位）。
export type MacroSeriesDeps = Pick<AppDeps, 'macroSeries' | 'macroData'>;

const fromFilter = <T extends { period: string }>(entries: T[], from?: string): T[] => (from ? entries.filter((e) => e.period >= from) : entries);

export const getBusinessCycleIndicators = async (query: { from?: string }, deps: MacroSeriesDeps): Promise<BusinessCycleResult> => {
  const rows = await deps.macroSeries.listBusinessCycleIndicatorsAsc();
  return { entries: fromFilter(rows.map((r) => ({ period: toMonthPeriod(r.year, r.month), ...r })), query.from) };
};

export const getMonetaryAggregates = async (query: { from?: string }, deps: MacroSeriesDeps): Promise<MonetaryAggregateResult> => {
  const rows = await deps.macroSeries.listMonetaryAggregatesAsc();
  return { entries: fromFilter(rows.map((r) => ({ period: toMonthPeriod(r.year, r.month), ...r })), query.from) };
};

// 2026-09-22 web-nuxt 大事件年表頁正式提需求：大盤月平均推到 1987-05 才填得滿 35 年回看視窗（twse 月線只到 1999）。
export const getStockMarketSummaries = async (query: { from?: string }, deps: MacroSeriesDeps): Promise<StockMarketSummaryResult> => {
  const rows = await deps.macroSeries.listStockMarketSummariesAsc();
  return { entries: fromFilter(rows.map((r) => ({ period: toMonthPeriod(r.year, r.month), ...r })), query.from) };
};

// 既有 GET /macro/gov-bond-yield-10y 只回最新一筆（估值卡片用），這支是整段歷史，走 macroData 既有的 asc 查詢。
export const getGovBondYield10yHistory = async (query: { from?: string }, deps: MacroSeriesDeps): Promise<GovBondYield10yHistoryResult> => {
  const rows = await deps.macroData.listGovBondYields10yAsc();
  return { entries: fromFilter(rows.map((r) => ({ period: toMonthPeriod(r.year, r.month), year: r.year, month: r.month, yieldPct: r.yieldRate })), query.from) };
};

// 日資料，形狀跟 /market/taiex-daily-price 一樣用 limit+interval（前端已經會處理），由舊到新。
export const getUsdTwdRates = async (limit: number, interval: UsdTwdInterval, deps: MacroSeriesDeps): Promise<UsdTwdRateResult> => {
  const rows = await deps.macroSeries.listLatestUsdTwdRates(limit, interval);
  return { entries: rows.map((r) => ({ ...r, tradeDate: r.tradeDate.toISOString().slice(0, 10) })).reverse() };
};

export const getCpi = async (query: { category: string; from?: string }, deps: MacroSeriesDeps): Promise<CpiResult> => {
  const rows = await deps.macroSeries.listCpiAsc(query.category);
  return { category: query.category, entries: fromFilter(rows.map((r) => ({ period: toMonthPeriod(r.year, r.month), ...r })), query.from) };
};

export const getGdp = async (query: { category: string; from?: string }, deps: MacroSeriesDeps): Promise<GdpResult> => {
  const rows = await deps.macroSeries.listGdpAsc(query.category);
  return { category: query.category, entries: fromFilter(rows.map((r) => ({ period: toQuarterPeriod(r.year, r.quarter), ...r })), query.from) };
};
