import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getExDividendCalendar } from '@/application/stocks/service';
import type { CompanyProfilePort } from '@/application/ports/companyProfiles';
import type { DividendEventsPort, RealizedExDividendRow } from '@/application/ports/dividendEvents';
import type { ExDividendCalendarEntry, MarketDataPort } from '@/application/ports/marketData';
import { createTestDeps } from '../../../fakes/createTestDeps';

// 2026-09-22 月曆往回翻：釘住「今天為界拆兩來源」「realized 列的 exType 推導與元／股→股／股換算」「合併後排序」。
// 今天固定 2026-09-22；查 2026-09 這個月 → 9/1–9/21 走分派公告、9/22–9/30 走預告表。

const notice = (symbol: string, exDate: string): ExDividendCalendarEntry => ({
  symbol,
  status: 'announced',
  paymentDate: null,
  fiscalYear: null,
  exDate,
  exType: '息',
  stockDividendRatio: null,
  subscriptionRatio: null,
  subscriptionPricePerShare: null,
  cashDividend: 1.5,
  sharesOffered: null,
  sharesEmpOwner: null,
  sharesholderOwner: null,
  stockHoldingRatio: null,
});

const realized = (symbol: string, exDate: string, over: Partial<RealizedExDividendRow> = {}): RealizedExDividendRow => ({
  symbol,
  companyName: `${symbol}名`,
  exDate: new Date(exDate),
  parValue: 10,
  rocFiscalYear: 114,
  fiscalQuarter: null,
  cashDividendFromEarnings: 0.4,
  cashDividendFromCapitalReserve: 0.1,
  stockDividendFromEarnings: null,
  stockDividendFromCapitalReserve: null,
  exDividendDate: new Date(exDate),
  exRightsDate: null,
  cashDividendPaymentDate: new Date('2026-10-22'),
  announcementDate: null,
  ...over,
});

let calls: { announced?: [Date, Date]; realized?: [Date, Date] } = {};
const deps = createTestDeps({
  market: { getExDividendCalendar: async (s: Date, e: Date) => ((calls.announced = [s, e]), [notice('2330', '2026-09-25'), notice('1101', '2026-09-22')]) } as unknown as MarketDataPort,
  dividendEvents: {
    listRealizedExDividendRows: async (s: Date, e: Date) => ((calls.realized = [s, e]), [realized('2614', '2026-09-06', { stockDividendFromEarnings: 0.8, exRightsDate: new Date('2026-09-06') }), realized('2890', '2026-09-10', { exDividendDate: null, exRightsDate: new Date('2026-09-10'), cashDividendFromEarnings: null, cashDividendFromCapitalReserve: null })]),
  } as unknown as DividendEventsPort,
  companyProfiles: { getCompanyNamesForSymbols: async (symbols: string[]) => new Map(symbols.map((s) => [s, `${s}簡稱`])) } as unknown as CompanyProfilePort,
});

describe('getExDividendCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T03:00:00Z'));
    calls = {};
  });
  afterEach(() => vi.useRealTimers());

  test('今天為界：預告表查 [今天, 月底]、分派公告查 [月初, 昨天]；合併後依 exDate/symbol 排序', async () => {
    const { entries } = await getExDividendCalendar(new Date('2026-09-01'), new Date('2026-09-30'), deps);
    expect(calls.announced!.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-09-22', '2026-09-30']);
    expect(calls.realized!.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-09-01', '2026-09-21']);
    expect(entries.map((e) => [e.exDate, e.symbol, e.status])).toEqual([
      ['2026-09-06', '2614', 'realized'],
      ['2026-09-10', '2890', 'realized'],
      ['2026-09-22', '1101', 'announced'],
      ['2026-09-25', '2330', 'announced'],
    ]);
  });

  test('realized 列：權息推導、現金加總、股票股利 0.8 元÷面額 10 = 0.08、公告簡稱、發放日與所屬年度', async () => {
    const { entries } = await getExDividendCalendar(new Date('2026-09-01'), new Date('2026-09-30'), deps);
    expect(entries[0]).toMatchObject({ symbol: '2614', companyName: '2614名', exType: '權息', cashDividend: 0.5, stockDividendRatio: 0.08, paymentDate: '2026-10-22', fiscalYear: 2025, subscriptionRatio: null, sharesOffered: null });
    expect(entries[1]).toMatchObject({ symbol: '2890', exType: '權', cashDividend: null, stockDividendRatio: null });
    expect(entries[2]).toMatchObject({ symbol: '1101', companyName: '1101簡稱', paymentDate: null, fiscalYear: null });
  });

  test('整個月都在過去：不打預告表', async () => {
    await getExDividendCalendar(new Date('2026-08-01'), new Date('2026-08-31'), deps);
    expect(calls.announced).toBeUndefined();
    expect(calls.realized!.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-08-01', '2026-08-31']);
  });

  test('整個月都在未來：不打分派公告', async () => {
    await getExDividendCalendar(new Date('2026-11-01'), new Date('2026-11-30'), deps);
    expect(calls.realized).toBeUndefined();
    expect(calls.announced!.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-11-01', '2026-11-30']);
  });
});
