import type { AppDeps } from '@/application/deps';
import type { ExDividendCalendarEntry } from '@/application/ports/marketData';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type {
  StockPricesResult,
  StockQuoteResult,
  StockSummaryResult,
  ExDividendNoticesResult,
  ExDividendCalendarResult,
  ForeignShareholdingHistoryResult,
  StockPledgeRatioHistoryResult,
  DailyPriceHistoryResult,
} from './types';

// 2026-09-17 Phase 4：從 http/modules/stocks/service.ts 搬來，資料存取改透過 deps 的 port
// （companyProfiles/market/metricValueQueries）注入，邏輯逐字不變。
export type StocksDeps = Pick<AppDeps, 'companyProfiles' | 'market' | 'metricValueQueries' | 'dividendEvents' | 'reportAvailability' | 'etfData'>;

// 2026-09-08 起改讀 pitMetrics（exchangePeRatio/exchangePbRatio/dividendYield，
// snapshotCadence='EOD'）取代舊架構的 MarketRatiosResult——舊表連同 domainMetrics/marketRatios.ts
// 一起退場了（filterCatalog.csv 最後 6 列確認是開發環境假資料誤判、沒有真實功能依賴，
// 見 abstract-crafting-journal.md）。2026-09-09 起改查 metricDailyCadenceValue——逐日型
// 指標已經從共用的 metric_values 拆到獨立的 metric_daily_cadence_values，tradeDate 在
// 那張表是 NOT NULL 的真正自然鍵，不再需要判斷「有沒有 tradeDate」。三個 metricCode 是
// 同一次 computeAndWriteMarketRatiosPit 呼叫一起寫入的，理論上 tradeDate 一致，這裡各自
// 獨立查「最新一筆」而不是假設一定同步，跟 getMetricHistory 的既有慣例一致（用
// knowledgeDate desc 取最新，不是相信呼叫端保證同步）。dataType/subsidiaryCompanyId
// 這是純市場數字，沒有個體/合併報表的區分，但 2026-09-22 起 data_type 鍵跟這家公司其他指標一致（見
// application/ports/reportAvailability.ts），不再寫死 '2'。
const MARKET_RATIOS_SUBSIDIARY_COMPANY_ID = '';

const getLatestMarketRatioValue = async (deps: StocksDeps, symbol: string, metricCode: string): Promise<{ tradeDate: Date; value: number | null } | null> =>
  deps.metricValueQueries.findLatestSnapshotValue(symbol, metricCode, 'EOD', await deps.reportAvailability.resolveDataType(symbol), MARKET_RATIOS_SUBSIDIARY_COMPANY_ID);

// 2026-09-27 本益比、股價淨值比改用我們自己的即時版（livePeRatio／livePbRatio：除息、除權、面額換發、減資恢復交易當天就換算；
// 交易所公告的每股淨值與 EPS 要等下一季財報才更新，使用者：「希望我們網站的數據不要跟交易所一樣慢」）。
// 我們算不出來的（例如查無股本歷史的 KY 公司）退回交易所公告值，不讓個股頁比原本少資料。殖利率仍是交易所公告值。
const getLatestRatioPreferLive = async (deps: StocksDeps, symbol: string, liveCode: string, exchangeCode: string) => {
  const [live, exchange] = await Promise.all([getLatestMarketRatioValue(deps, symbol, liveCode), getLatestMarketRatioValue(deps, symbol, exchangeCode)]);
  return live?.value !== null && live?.value !== undefined ? live : exchange;
};

// 給 bff-ts 的 GET /stocks/:symbol/quote 用（取代他們拆掉直連 twse/tpex DB 後留的 503）。
// 回傳 null 代表這家公司在上市、上櫃都查無登記資料，controller 那層轉成 404；公司存在但查無
// 股價/估值資料是另一回事，price/valuation 個別是 null，仍然是 200——bff-ts 的規格明確要求
// 這兩種情境要分開。
export const getStockQuote = async (symbol: string, deps: StocksDeps): Promise<StockQuoteResult | null> => {
  const [exists, price, peRatioRow, pbRatioRow, dividendYieldRow] = await Promise.all([
    deps.companyProfiles.companyExists(symbol),
    deps.market.getLatestDailyPrice(symbol),
    getLatestRatioPreferLive(deps, symbol, 'livePeRatio', 'exchangePeRatio'),
    getLatestRatioPreferLive(deps, symbol, 'livePbRatio', 'exchangePbRatio'),
    getLatestMarketRatioValue(deps, symbol, 'dividendYield'),
  ]);

  if (!exists) return null;

  // 三者理論上是同一次批次寫入、tradeDate 一致，但各自獨立查詢不保證同步——用任一筆
  // 有值的 tradeDate 當代表（優先 peRatio，其次 pbRatio/dividendYield），三者都查無
  // 資料時 valuation 整體是 null，跟舊架構「查無估值資料」的語意一致。
  const representativeTradeDate = peRatioRow?.tradeDate ?? pbRatioRow?.tradeDate ?? dividendYieldRow?.tradeDate ?? null;

  return {
    symbol,
    price: price ? { tradeDate: price.tradeDate.toISOString().slice(0, 10), close: price.close } : null,
    valuation: representativeTradeDate
      ? {
          tradeDate: representativeTradeDate.toISOString().slice(0, 10),
          peRatio: peRatioRow?.value ?? null,
          pbRatio: pbRatioRow?.value ?? null,
          dividendYield: dividendYieldRow?.value ?? null,
        }
      : null,
  };
};

// 2026-09-13 web-nuxt 回報：個股頁靠前端寫死的 20 檔清單判斷「股票存不存在」，不在清單裡
// 的股票（例如 2801）一律顯示查無資料——誤把這個後端當成「要先撈全市場清單」的架構，實際
// 是按 symbol 現查。這支端點把個股頁需要的股價/漲跌/成交量/PER/PBR/殖利率/市值一次組給
// 呼叫端，取代原本要串 quote + daily-price-history + metric-history 三支的做法，讓
// web-nuxt 可以整個換掉那份寫死清單。
// 漲跌用 daily_price 最近兩個交易日的收盤價自己算（limit=2），跟 price/volume 同一次查詢、
// 保證同一組交易日，不會有「price 是今天、change 卻拿舊資料算」的不同步問題。
export const getStockSummary = async (symbol: string, deps: StocksDeps): Promise<StockSummaryResult | null> => {
  const [exists, priceHistory, peRatioRow, pbRatioRow, dividendYieldRow, marketCapRow] = await Promise.all([
    deps.companyProfiles.companyExists(symbol),
    deps.market.getDailyPriceHistory(symbol, 2),
    getLatestRatioPreferLive(deps, symbol, 'livePeRatio', 'exchangePeRatio'),
    getLatestRatioPreferLive(deps, symbol, 'livePbRatio', 'exchangePbRatio'),
    getLatestMarketRatioValue(deps, symbol, 'dividendYield'),
    getLatestMarketRatioValue(deps, symbol, 'liveMarketCap'),
  ]);

  if (!exists) return null;

  const priceEntries = priceHistory.entries;
  const latest = priceEntries.at(-1) ?? null;
  const previous = priceEntries.length >= 2 ? priceEntries.at(-2)! : null;
  const change =
    latest?.close !== null && latest?.close !== undefined && previous?.close !== null && previous?.close !== undefined
      ? {
          amount: Math.round((latest.close - previous.close) * 100) / 100,
          percent: previous.close !== 0 ? Math.round(((latest.close - previous.close) / previous.close) * 10000) / 100 : null,
        }
      : null;

  const representativeValuationDate = peRatioRow?.tradeDate ?? pbRatioRow?.tradeDate ?? dividendYieldRow?.tradeDate ?? null;

  return {
    symbol,
    price: latest ? { tradeDate: latest.tradeDate, close: latest.close, volume: latest.volume, change } : null,
    valuation: representativeValuationDate
      ? {
          tradeDate: representativeValuationDate.toISOString().slice(0, 10),
          peRatio: peRatioRow?.value ?? null,
          pbRatio: pbRatioRow?.value ?? null,
          dividendYield: dividendYieldRow?.value ?? null,
        }
      : null,
    marketCap: marketCapRow ? { tradeDate: marketCapRow.tradeDate.toISOString().slice(0, 10), value: marketCapRow.value } : null,
  };
};

// 給 bff-ts 的 GET /stocks/prices?symbols=... 用——他們的用法是「給我這確切幾檔的股價」
// （一次最多幾十檔，screener 一頁的量），不是開放式查詢，所以這支刻意不做 limit/count_only：
// 查不到的 symbol 就不會出現在 prices 物件裡，不是靜默截斷成某個數量以內。
//
// 2026-10-06 bff-ts（觀察清單改版，使用者確認過）要前一交易日收盤價算漲跌，省掉每檔一次 daily-price-history?limit=2。
// previousClose = tradeDate 之前最近一筆「有成交」的收盤價：前一天沒成交（daily_price 有列但 close 是 NULL）就往前找到
// 最後一個真的收盤價，previousTradeDate 照實給那一天，呼叫端看得出中間隔了幾天。新掛牌/ETF 第一天沒有更早的列 → 兩個都 null。
// 轉板公司兩市一起看。原始收盤價，不是除權息參考價——除權息當天用它算的漲跌會包含配息造成的價差（交易所沒有給參考價欄位）。
export const getStockPrices = async (symbols: string[], deps: StocksDeps): Promise<StockPricesResult> => {
  const [priceMap, closesMap] = await Promise.all([deps.market.getLatestDailyPricesBatch(symbols), deps.market.getRecentClosesBatch(symbols)]);

  const prices: StockPricesResult['prices'] = {};
  for (const [symbol, price] of priceMap) {
    const previous = closesMap.get(symbol)?.find((row) => row.tradeDate < price.tradeDate) ?? null;
    prices[symbol] = {
      close: price.close,
      tradeDate: price.tradeDate.toISOString().slice(0, 10),
      previousClose: previous?.close ?? null,
      previousTradeDate: previous ? previous.tradeDate.toISOString().slice(0, 10) : null,
    };
  }
  return { prices };
};

// 給個股頁面「下次除權息」提示、觀察清單「近期除權息」卡片用——2026-09-04 應 web-nuxt
// 要求新增，同一個 symbol 參數同時支援單一公司（個股頁面）跟多公司批次查詢（觀察清單），
// 跟 getStockPrices 同一種慣例。沒有事件的 symbol 直接不會出現在回傳的 notices 裡，不是空陣列。
//
// 2026-10-06 使用者拍板（web-nuxt 提議）：改用下面月曆那套合併資料（twse 預告表＋mops 股利分派公告＋sitca ETF 收益分配），
// 依 symbol 篩出「還沒除息」或「已除息但發放日還沒到」的事件。原因兩個（2026-10-06 實測）：(1) 只讀 twse 預告表時
// 觀察清單裡的 ETF 大多查不到——預告表只收 8 組左右的 ETF，sitca 那邊尚未除息的 ETF 事件有 100 筆；(2) 預告列一律沒有
// 發放日、ETF 金額要到除息前幾天才公布，真正需要發放日的是「已除息、還沒發錢」那 3～5 週（當天 157 筆、全部有發放日）。
// status 分辨兩者：announced = 還沒除息、realized = 已除息待發放；個股頁「下次除權息」要自己篩 announced。
// 已除息但沒有發放日（純除權、或公告沒填）的列不給——沒辦法說它「還沒發」。
// ponytail: 查全市場月曆再篩 symbol（往回 60 天＋往後 365 天）；觀察清單一次幾十檔、一天幾百列，慢了再把 symbol 篩選推進三個查詢。
const UNPAID_LOOKBACK_DAYS = 60; // 2026-10-06 實測除息→發放最久 37 天（個股 p95 35、ETF p95 29）
const NOTICE_LOOKAHEAD_DAYS = 365;
export const getExDividendNotices = async (symbols: string[], deps: StocksDeps): Promise<ExDividendNoticesResult> => {
  if (symbols.length === 0) return { notices: {} };
  const today = new Date(new Date().toISOString().slice(0, 10));
  const todayIso = toIso(today)!;
  const { entries } = await getExDividendCalendar(
    new Date(today.getTime() - UNPAID_LOOKBACK_DAYS * 86_400_000),
    new Date(today.getTime() + NOTICE_LOOKAHEAD_DAYS * 86_400_000),
    deps
  );
  const wanted = new Set(symbols);
  const notices: ExDividendNoticesResult['notices'] = {};
  for (const entry of entries) {
    if (!wanted.has(entry.symbol)) continue;
    if (entry.exDate < todayIso && !(entry.paymentDate !== null && entry.paymentDate >= todayIso)) continue;
    (notices[entry.symbol] ??= []).push(entry);
  }
  return { notices };
};

// 2026-09-10 web-nuxt 轉達使用者需求：全市場除權息日曆（月曆格狀呈現），不是針對已知的
// symbol 清單查——2026-10-06 起上面 getExDividendNotices 反過來重用這支（依 symbol 篩），
// 差別是不帶 symbol 篩選、改用日期區間，並附上 companyName（月曆情境需要顯示公司名稱，
// 不只是代號）。
// 2026-09-22 web-nuxt：月曆要能往回翻。twse 預告表（ex_dividend_notice）只有「已公告、尚未發生」的事件，
// 除息日一過就消失，所以過去月份改接 mops 股利分派公告（dividend_distribution，跟 /companies/dividend-history
// 同一張）。以「今天（UTC 日）」為界：>= 今天走預告表（status announced，可能還會改），< 今天走分派公告
// （status realized，事實）；兩段各自查、合併後依 exDate/symbol 排序，同一天不會同時出現在兩邊。
// 深度（2026-09-22 與 mops-ts 議定）：回補完的起點是**除息日 2020-09** 左右——回補範圍是盈餘所屬年度
// 民國 109~115，而 fiscal 109 最早的除息日是 2020-09-17（2020 上半的除息事件屬於 fiscal 108，不補）。
// 這個起點跟全服務的 109Q3 財報地板刻意對齊，避免同一頁出現「有除息事件、沒有對應財報」。
// 回補跑完 mops-ts 會給實際的 MIN(除息日)，web-nuxt 的往回翻上限（COVERAGE_FROM）就設那個值。
// 回補前的現況：全市場覆蓋 2026-03 起，更早只有種子公司。任何情況都是有多少給多少，超出範圍回空陣列不報錯。
// 已實現列的 companyName 直接用公告上的簡稱（ETF/特別股也有），預告列仍查 profile（只有普通股有名字，
// 這是 company_profile 的範圍，不在這裡補）。
const toIso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const sumNonNull = (...values: (number | null)[]): number | null => (values.every((v) => v === null) ? null : values.reduce<number>((acc, v) => acc + (v ?? 0), 0));
const toNumberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

export const getExDividendCalendar = async (startDate: Date, endDate: Date, deps: StocksDeps): Promise<ExDividendCalendarResult> => {
  const today = new Date(new Date().toISOString().slice(0, 10));
  const announcedStart = startDate >= today ? startDate : today;
  const realizedEnd = endDate < today ? endDate : new Date(today.getTime() - 86_400_000);

  const [announced, realized, etfRows] = await Promise.all([
    announcedStart <= endDate ? deps.market.getExDividendCalendar(announcedStart, endDate) : Promise.resolve([]),
    realizedEnd >= startDate ? deps.dividendEvents.listRealizedExDividendRows(startDate, realizedEnd) : Promise.resolve([]),
    // 2026-09-23：ETF 的收益分配整段都從 sitca 來（不分 announced/realized）——FundClear 的資料同時含已發生與
    // 已公告未發生的分配，所以查整個區間、不用今天切。ETF 不會出現在上面兩個來源裡（twse 預告表只收個股、
    // mops dividend_distribution 是上市櫃公司的股利分派決議，實測 00 開頭零筆）。
    deps.etfData.listEtfDividendsForRange(startDate, endDate),
  ]);

  const nameMap = await deps.companyProfiles.getCompanyNamesForSymbols(announced.map((r) => r.symbol));
  const announcedEntries = announced.map((r) => ({ ...r, companyName: nameMap.get(r.symbol) ?? null }));

  const realizedEntries = realized.map((r) => {
    const cashDividend = sumNonNull(r.cashDividendFromEarnings, r.cashDividendFromLegalReserveAndCapitalSurplus);
    const stockDividend = sumNonNull(r.stockDividendFromEarnings, r.stockDividendFromLegalReserveAndCapitalSurplus);
    const hasCash = r.exDividendDate !== null;
    const hasStock = r.exRightsDate !== null;
    return {
      symbol: r.symbol,
      companyName: r.companyName,
      status: 'realized' as const,
      exDate: toIso(r.exDate)!,
      exType: (hasCash && hasStock ? '權息' : hasStock ? '權' : '息') as ExDividendCalendarEntry['exType'],
      cashDividend,
      // 分派公告是元／股（面額計），預告表是股／股：0.8 元 ÷ 面額 10 = 0.08，跟 twse 表逐筆對過（2614/1235）。
      stockDividendRatio: stockDividend !== null && r.parValue ? round4(stockDividend / r.parValue) : null,
      subscriptionRatio: null,
      subscriptionPricePerShare: null,
      sharesOffered: null,
      sharesEmpOwner: null,
      sharesholderOwner: null,
      stockHoldingRatio: null,
      paymentDate: toIso(r.cashDividendPaymentDate),
      fiscalYear: r.rocFiscalYear === null ? null : rocYearToGregorian(r.rocFiscalYear),
      securityType: 'COMMON' as const,
      recordDate: null,
      distributionPerUnit: null,
      composition: null,
    };
  });

  // ETF 列：status 用除息日跟今天比，跟個股那兩段的語意對齊（>= 今天是尚未發生的公告、< 今天是既成事實）。
  // exType 固定 '息'——ETF 的收益分配沒有除權（不會配發受益權單位），這是結構性的不是資料缺漏。
  // 組成百分比五欄**原樣透傳**：null（未揭露）跟 0（有揭露且為零）是兩件事，不做任何填補，見
  // application/ports/marketData.ts 的 EtfDistributionComposition 說明。
  const etfEntries = etfRows.map((r) => ({
    symbol: r.symbol,
    companyName: r.etf_name,
    status: (r.ex_dividend_date >= today ? 'announced' : 'realized') as ExDividendCalendarEntry['status'],
    exDate: toIso(r.ex_dividend_date)!,
    exType: '息' as ExDividendCalendarEntry['exType'],
    cashDividend: null,
    stockDividendRatio: null,
    subscriptionRatio: null,
    subscriptionPricePerShare: null,
    sharesOffered: null,
    sharesEmpOwner: null,
    sharesholderOwner: null,
    stockHoldingRatio: null,
    paymentDate: toIso(r.payment_date),
    fiscalYear: null,
    securityType: 'ETF' as const,
    recordDate: toIso(r.record_date),
    distributionPerUnit: toNumberOrNull(r.distribution_per_unit),
    // 2026-09-30 金額還沒公布的列不給組成：FundClear 對預告列直接放**上一次**的組成（00939 2026-10-05 跟 09-01 逐字相同，
    // sitca-ts 比對原始回應確認是來源原樣），不是對這次的預測。sitca 的建議是「amount_announced=false 的列組成不要顯示、不要拿去算」，
    // 那個欄位的定義就是 distribution_per_unit 非 null，所以這裡直接用它判斷。從 payload 看不出這種錯，所以在這層擋，不交給下游叮嚀。
    composition:
      r.distribution_per_unit === null
        ? null
        : {
            dividendIncomePct: toNumberOrNull(r.composition_dividend_income_pct),
            interestIncomePct: toNumberOrNull(r.composition_interest_income_pct),
            incomeEqualizationPct: toNumberOrNull(r.composition_income_equalization_pct),
            realizedCapitalGainPct: toNumberOrNull(r.composition_realized_capital_gain_pct),
            otherIncomePct: toNumberOrNull(r.composition_other_income_pct),
          },
  }));

  // 同一個 (exDate, symbol) 可能同時出現在兩邊——**twse 預告表本來就含 ETF**（它們也是上市證券），
  // 實測 2026-10 有 8 組、2026-09 有 1 組。不能二選一，因為兩邊各有對方沒有的欄位：預告表有已宣告的
  // 配息金額（cashDividend），sitca 有組成拆解與基準日、但未來月份的 distribution_per_unit 還是 null。
  // 所以個股那兩段先進 map，ETF 列命中既有 key 就**補欄位**（標成 ETF、補基準日/組成，金額只在非 null
  // 時覆蓋），沒命中才當新列加入。
  const byKey = new Map<string, (typeof announcedEntries)[number] | (typeof realizedEntries)[number] | (typeof etfEntries)[number]>();
  for (const e of [...realizedEntries, ...announcedEntries]) byKey.set(`${e.exDate}|${e.symbol}`, e);
  for (const e of etfEntries) {
    const key = `${e.exDate}|${e.symbol}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, e);
      continue;
    }
    byKey.set(key, {
      ...existing,
      securityType: 'ETF' as const,
      recordDate: e.recordDate,
      composition: e.composition,
      distributionPerUnit: e.distributionPerUnit,
      // 預告表的 companyName 要查 profile 而 ETF 不在 company_profile 裡，通常是 null；用基金名稱補。
      companyName: existing.companyName ?? e.companyName,
    });
  }

  const entries = [...byKey.values()].sort((a, b) => (a.exDate === b.exDate ? a.symbol.localeCompare(b.symbol) : a.exDate.localeCompare(b.exDate)));
  return { entries };
};

// 2026-09-08 web-nuxt 轉達使用者需求：個股頁面外資持股卡片。目前只有 2330 有真實資料
// （twse-ts 一次性回填，不是常態排程），其他 symbol 會回傳空陣列——前端顯示「尚未提供」
// 是前端自己的降級處理，這支不需要特別區分「查無資料」跟「這家公司真的沒有外資持股」。
export const getForeignShareholdingHistory = async (symbol: string, limit: number, deps: StocksDeps): Promise<ForeignShareholdingHistoryResult> => {
  const entries = await deps.market.getForeignShareholdingHistory(symbol, limit);
  return { symbol, entries };
};

// 2026-09-10 使用者要求：個股頁面董監事質押比例卡片，比照 getForeignShareholdingHistory
// 同一種「回傳完整歷史陣列，查無資料就是空陣列」的模式——不進 pitMetrics，讓前端直接對照
// TWSE 公告原始數字序列（見 stockPledgeRatio.ts 的說明）。
export const getStockPledgeRatioHistory = async (symbol: string, limit: number, deps: StocksDeps): Promise<StockPledgeRatioHistoryResult> => {
  const entries = await deps.market.getStockPledgeRatioHistory(symbol, limit);
  return { symbol, entries };
};

// 2026-09-10 web-nuxt 轉達使用者需求：個股頁面「市場評價」分頁要一張真正的逐日股價線圖——
// 既有 PE/PB 河流圖裡的 stockPrice metricCode 是季報型（每季一個點），不是逐日。這支直接查
// twse-ts/tpex-ts 的 daily_price，不經過 pitMetrics（那套架構是給「隨財報更新知識時點」的
// 指標用，逐日股價沒有這個概念，直接查表就好，不需要 knowledgeDate 解析）。
export const getDailyPriceHistory = async (symbol: string, limit: number, deps: StocksDeps): Promise<DailyPriceHistoryResult> => {
  const { entries, earliestAvailableTradeDate } = await deps.market.getDailyPriceHistory(symbol, limit);
  return { symbol, entries, earliestAvailableTradeDate };
};
