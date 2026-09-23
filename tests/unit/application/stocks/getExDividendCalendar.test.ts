import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getExDividendCalendar } from '@/application/stocks/service';
import type { CompanyProfilePort } from '@/application/ports/companyProfiles';
import type { DividendEventsPort, RealizedExDividendRow } from '@/application/ports/dividendEvents';
import type { ExDividendCalendarEntry, MarketDataPort } from '@/application/ports/marketData';
import type { EtfDataPort, RawEtfDividendRow } from '@/application/ports/etfData';
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
  securityType: 'COMMON',
  recordDate: null,
  distributionPerUnit: null,
  composition: null,
});

// 2026-09-23 ETF 收益分配：整段從 sitca 來、不分 announced/realized（FundClear 同時含已發生與已公告未發生），
// 所以查的是整個區間、不用今天切——下面「整個月都在過去/未來」兩個案例會釘住這點。
const etfRow = (symbol: string, exDate: string, over: Partial<RawEtfDividendRow> = {}): RawEtfDividendRow => ({
  symbol,
  etf_name: `${symbol}基金`,
  ex_dividend_date: new Date(exDate),
  record_date: new Date(exDate),
  payment_date: new Date('2026-10-15'),
  distribution_per_unit: 0.12,
  composition_dividend_income_pct: 25,
  composition_interest_income_pct: 0,
  composition_income_equalization_pct: 74.48,
  composition_realized_capital_gain_pct: 0,
  composition_other_income_pct: null,
  ...over,
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

let calls: { announced?: [Date, Date]; realized?: [Date, Date]; etf?: [Date, Date] } = {};
const deps = createTestDeps({
  market: { getExDividendCalendar: async (s: Date, e: Date) => ((calls.announced = [s, e]), [notice('2330', '2026-09-25'), notice('1101', '2026-09-22')]) } as unknown as MarketDataPort,
  dividendEvents: {
    listRealizedExDividendRows: async (s: Date, e: Date) => ((calls.realized = [s, e]), [realized('2614', '2026-09-06', { stockDividendFromEarnings: 0.8, exRightsDate: new Date('2026-09-06') }), realized('2890', '2026-09-10', { exDividendDate: null, exRightsDate: new Date('2026-09-10'), cashDividendFromEarnings: null, cashDividendFromCapitalReserve: null })]),
  } as unknown as DividendEventsPort,
  companyProfiles: { getCompanyNamesForSymbols: async (symbols: string[]) => new Map(symbols.map((s) => [s, `${s}簡稱`])) } as unknown as CompanyProfilePort,
  etfData: {
    listEtfDividendsForRange: async (s: Date, e: Date) => ((calls.etf = [s, e]), [etfRow('00939', '2026-09-15'), etfRow('00940', '2026-09-28')]),
  } as unknown as EtfDataPort,
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
      ['2026-09-15', '00939', 'realized'],
      ['2026-09-22', '1101', 'announced'],
      ['2026-09-25', '2330', 'announced'],
      ['2026-09-28', '00940', 'announced'],
    ]);
  });

  test('ETF 列：整段查同一個區間（不用今天切），status 仍依除息日推導', async () => {
    await getExDividendCalendar(new Date('2026-09-01'), new Date('2026-09-30'), deps);
    expect(calls.etf!.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-09-01', '2026-09-30']);
  });

  test('ETF 列：組成百分比原樣透傳，未揭露是 null 不是 0', async () => {
    const { entries } = await getExDividendCalendar(new Date('2026-09-01'), new Date('2026-09-30'), deps);
    const etf = entries.find((e) => e.symbol === '00939')!;
    expect(etf).toMatchObject({
      securityType: 'ETF',
      companyName: '00939基金',
      exType: '息',
      cashDividend: null, // ETF 用 distributionPerUnit，不塞進個股的 cashDividend
      distributionPerUnit: 0.12,
      recordDate: '2026-09-15',
      paymentDate: '2026-10-15',
      fiscalYear: null,
    });
    // 0（有揭露且為零）跟 null（未揭露）必須分得開——這是下游明確要求的。
    expect(etf.composition).toEqual({
      dividendIncomePct: 25,
      interestIncomePct: 0,
      incomeEqualizationPct: 74.48,
      realizedCapitalGainPct: 0,
      otherIncomePct: null,
    });
  });

  // twse 預告表本來就含 ETF（它們也是上市證券），實測 2026-10 有 8 組同時出現在兩邊。兩邊各有對方沒有的
  // 欄位——預告表有已宣告的 cashDividend、sitca 有組成與基準日但未來月份金額還是 null——所以是合併不是二選一。
  test('同一個 (exDate, symbol) 兩邊都有時：合併成一列，不重複', async () => {
    const dupDeps = createTestDeps({
      market: { getExDividendCalendar: async () => [{ ...notice('00939', '2026-09-25'), cashDividend: 0.07 }] } as unknown as MarketDataPort,
      dividendEvents: { listRealizedExDividendRows: async () => [] } as unknown as DividendEventsPort,
      companyProfiles: { getCompanyNamesForSymbols: async () => new Map() } as unknown as CompanyProfilePort,
      etfData: { listEtfDividendsForRange: async () => [etfRow('00939', '2026-09-25', { distribution_per_unit: null })] } as unknown as EtfDataPort,
    });
    const { entries } = await getExDividendCalendar(new Date('2026-09-01'), new Date('2026-09-30'), dupDeps);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      symbol: '00939',
      securityType: 'ETF', // 被 ETF 那側標記
      cashDividend: 0.07, // 預告表已宣告的金額保留下來
      distributionPerUnit: null, // sitca 未來月份還沒有金額，不拿 null 蓋掉上面那個
      recordDate: '2026-09-25', // 只有 sitca 有
      companyName: '00939基金', // 預告列查不到 profile（ETF 不在 company_profile），用基金名稱補
    });
    expect(entries[0]!.composition?.incomeEqualizationPct).toBe(74.48);
  });

  test('個股列的 ETF 專屬欄位一律 null，securityType 是 COMMON', async () => {
    const { entries } = await getExDividendCalendar(new Date('2026-09-01'), new Date('2026-09-30'), deps);
    for (const e of entries.filter((x) => x.symbol !== '00939' && x.symbol !== '00940')) {
      expect(e).toMatchObject({ securityType: 'COMMON', recordDate: null, distributionPerUnit: null, composition: null });
    }
  });

  test('realized 列：權息推導、現金加總、股票股利 0.8 元÷面額 10 = 0.08、公告簡稱、發放日與所屬年度', async () => {
    const { entries } = await getExDividendCalendar(new Date('2026-09-01'), new Date('2026-09-30'), deps);
    // 2026-09-23 改用 symbol 找而不是索引——加進 ETF 列之後索引會位移，用索引寫的斷言很脆弱。
    const bySymbol = (s: string) => entries.find((e) => e.symbol === s)!;
    expect(bySymbol('2614')).toMatchObject({ companyName: '2614名', exType: '權息', cashDividend: 0.5, stockDividendRatio: 0.08, paymentDate: '2026-10-22', fiscalYear: 2025, subscriptionRatio: null, sharesOffered: null });
    expect(bySymbol('2890')).toMatchObject({ exType: '權', cashDividend: null, stockDividendRatio: null });
    expect(bySymbol('1101')).toMatchObject({ companyName: '1101簡稱', paymentDate: null, fiscalYear: null });
  });

  test('整個月都在過去：不打預告表', async () => {
    await getExDividendCalendar(new Date('2026-08-01'), new Date('2026-08-31'), deps);
    expect(calls.announced).toBeUndefined();
    expect(calls.realized!.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-08-01', '2026-08-31']);
    expect(calls.etf!.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-08-01', '2026-08-31']); // ETF 不受今天切分影響
  });

  test('整個月都在未來：不打分派公告', async () => {
    await getExDividendCalendar(new Date('2026-11-01'), new Date('2026-11-30'), deps);
    expect(calls.realized).toBeUndefined();
    expect(calls.announced!.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-11-01', '2026-11-30']);
    expect(calls.etf!.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-11-01', '2026-11-30']);
  });
});
