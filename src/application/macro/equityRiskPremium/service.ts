import { buildFieldStatuses, type MetricStatus } from '@/domain/metrics/metricStatus';
import { capWeightedMeanPercent, geometricMeanPercent, supplySideErpPercent } from '@/domain/macro/supplySideEquityRiskPremium';
import type { AppDeps } from '@/application/deps';
import type { EquityRiskPremiumQuery, EquityRiskPremiumResult } from './types';

// 2026-09-17 Phase 4：資料查詢跟結果快取寫入透過 MacroDataPort 注入、log 透過 LoggerPort 注入
//（Decimal → number 的轉換搬進 repository）。
// 2026-09-29 使用者要求加第二種算法（供給面模型）做對照：多讀 CPI／GDP（macroSeries）、上市公司清單（companyProfiles）、
// 最新殖利率與市值（metricValueQueries）。
export type EquityRiskPremiumDeps = Pick<AppDeps, 'macroData' | 'macroSeries' | 'companyProfiles' | 'metricValueQueries' | 'logger'>;

type SupplySide = EquityRiskPremiumResult['supplySide'];

interface SupplySideSources {
  cpi: { key: string; yoy: number | null }[];
  gdp: { key: string; growth: number | null }[];
  dividendRows: { tradeDate: Date; symbol: string; dividendYield: number | null; marketCap: number | null }[];
  listedSymbols: Set<string>;
}

// 供給面 ERP（見 domain/macro/supplySideEquityRiskPremium.ts）。通膨、GDP 用跟歷史法同一段窗口 [startKey, endKey] 平均，
// 季資料以季末月份判斷是否落在窗口內；殖利率只有最新一天（沒有 1999 起的全市場殖利率歷史），無風險利率取窗口終點那個月。
// 殖利率只算上市公司（TAIEX 的母體），跟歷史法的市場報酬同一個市場。
// 市值加權的涵蓋率只能在「有市值的公司」之間算；大部分公司連市值都沒有時（例如逐日市值還沒回填），加權結果會退化成
// 少數幾家的殖利率、涵蓋率卻照樣顯示 100%（測試庫實測：只剩台積電一家、0.92%）。所以先要求上市公司大多有市值。
// 2026-09-29 DEV 實測 1,081 家有當天列、1,055 家有市值（97.6%）。
const MIN_MARKET_CAP_AVAILABILITY = 0.9;

const computeSupplySide = (sources: SupplySideSources, startKey: string, endKey: string, riskFree: number | null, warnings: string[]): SupplySide => {
  const inWindow = (key: string) => key >= startKey && key <= endKey;
  const inflationSamples = sources.cpi.filter((r) => inWindow(r.key) && r.yoy !== null).map((r) => r.yoy!);
  const growthSamples = sources.gdp.filter((r) => inWindow(r.key) && r.growth !== null).map((r) => r.growth!);
  const listedRows = sources.dividendRows.filter((r) => sources.listedSymbols.has(r.symbol));
  const withMarketCap = listedRows.filter((r) => r.marketCap !== null && r.marketCap > 0).length;
  const capAvailable = listedRows.length > 0 && withMarketCap / listedRows.length >= MIN_MARKET_CAP_AVAILABILITY;
  if (!capAvailable) {
    warnings.push(`上市公司只有 ${withMarketCap}/${listedRows.length} 家有最新市值，不足 ${MIN_MARKET_CAP_AVAILABILITY * 100}%，無法算市值加權殖利率，供給面 ERP 為 null。`);
  }
  const dividend = capAvailable ? capWeightedMeanPercent(listedRows.map((r) => ({ value: r.dividendYield, weight: r.marketCap }))) : null;

  const expectedInflation = geometricMeanPercent(inflationSamples);
  const realEarningsGrowth = geometricMeanPercent(growthSamples);
  const erp =
    expectedInflation !== null && realEarningsGrowth !== null && dividend !== null && riskFree !== null
      ? round4(supplySideErpPercent(expectedInflation, realEarningsGrowth, dividend.mean, riskFree))
      : null;

  return {
    erp,
    expectedInflation: expectedInflation === null ? null : round4(expectedInflation),
    realEarningsGrowth: realEarningsGrowth === null ? null : round4(realEarningsGrowth),
    peGrowth: 0,
    dividendYield: dividend === null ? null : round4(dividend.mean),
    riskFreeRate: riskFree,
    inflationMonths: inflationSamples.length,
    gdpQuarters: growthSamples.length,
    // 每家各取自己最新一筆（兩個市場更新時間不同），這裡報最新的那天。
    dividendYieldTradeDate: listedRows.reduce<string | null>((max, r) => { const d = r.tradeDate.toISOString().slice(0, 10); return max === null || d > max ? d : max; }, null),
    dividendYieldCompanyCount: dividend?.count ?? 0,
    dividendYieldMarketCapCoverage: dividend === null ? null : round4(dividend.coveragePercent),
  };
};

// 至少要有 2 個月才能算出 1 筆報酬率——低於這個數字連「算得出但不可靠」都談不上，直接回傳
// calculation_error（跟 beta 的 MIN_OBSERVATIONS 門檻同一種「樣本太少不計算」的處理方式）。
const HARD_MIN_MONTHS = 2;

// 2026-08-30 使用者用真實資料驗證過：5 年窗口（2021-09~2026-08）ERP ≈ 21%，10 年窗口
// （2016-06~2026-06）≈ 17%，都明顯偏離文獻常見區間（4%~8%），是台股這幾年剛好處在單一段極端
// 多頭造成的樣本偏誤；27 年窗口（1999-01~2026-06）才落回 5.8%~7.9%，貼近文獻。20 年（240 個月）
// 訂為「可信度警告」的門檻，不是硬性擋下計算——低於這個門檻仍然算給你，但會在 warnings 提醒。
const MIN_MONTHS_FOR_RELIABLE_ESTIMATE = 240;

const pad2 = (n: number): string => String(n).padStart(2, '0');
const toKey = (year: number, month: number): string => `${year}-${pad2(month)}`;
const round4 = (x: number): number => Math.round(x * 10000) / 10000;
const mean = (xs: number[]): number => xs.reduce((sum, x) => sum + x, 0) / xs.length;

const getTaiexMonthEndCloses = async (deps: EquityRiskPremiumDeps): Promise<Record<string, number>> => {
  const rows = await deps.macroData.listTaiexDailyClosesAsc();
  const monthEnd: Record<string, number> = {};
  for (const row of rows) {
    if (row.close === null) continue;
    const key = toKey(row.tradeDate.getUTCFullYear(), row.tradeDate.getUTCMonth() + 1);
    monthEnd[key] = row.close; // 依日期升冪走訪，同一個月份會被後面較晚的交易日覆寫，最後留下的就是該月最後一個收盤價
  }
  return monthEnd;
};

const getRiskFreeRateByMonth = async (deps: EquityRiskPremiumDeps): Promise<Record<string, number>> => {
  const rows = await deps.macroData.listGovBondYields10yAsc();
  const byMonth: Record<string, number> = {};
  for (const row of rows) {
    byMonth[toKey(row.year, row.month)] = row.yieldRate;
  }
  return byMonth;
};

export const calculateEquityRiskPremium = async (query: EquityRiskPremiumQuery, deps: EquityRiskPremiumDeps): Promise<EquityRiskPremiumResult> => {
  const warnings: string[] = [];
  const [taiex, riskFreeRate, cpiRows, gdpRows, dividendRows, listedSymbols] = await Promise.all([
    getTaiexMonthEndCloses(deps),
    getRiskFreeRateByMonth(deps),
    deps.macroSeries.listCpiAsc('total'),
    deps.macroSeries.listGdpAsc('growth_rate'),
    deps.metricValueQueries.listLatestDividendYieldWithMarketCap(),
    deps.companyProfiles.getSecuritySymbolSet({ market: 'TWSE', preferredStock: 'exclude' }),
  ]);
  const supplySideSources: SupplySideSources = {
    cpi: cpiRows.map((r) => ({ key: toKey(r.year, r.month), yoy: r.yoyChangePercent })),
    gdp: gdpRows.map((r) => ({ key: toKey(r.year, r.quarter * 3), growth: r.contributionPoints })),
    dividendRows,
    listedSymbols,
  };

  const taiexKeys = Object.keys(taiex).sort();
  const riskFreeKeys = Object.keys(riskFreeRate).sort();
  const dataCoverage = {
    taiexDateRange: { min: taiexKeys[0] ?? null, max: taiexKeys[taiexKeys.length - 1] ?? null },
    riskFreeRateDateRange: { min: riskFreeKeys[0] ?? null, max: riskFreeKeys[riskFreeKeys.length - 1] ?? null },
  };

  // 完整重疊區間（兩邊都有資料的月份），跟 query 的 start/end 無關——用來當「沒指定窗口時」的預設，
  // 也用來判斷使用者指定的窗口有沒有超出實際涵蓋範圍。
  const fullOverlapKeys = taiexKeys.filter((k) => riskFreeRate[k] !== undefined).sort();

  const requestedWindow = { startYear: query.startYear, startMonth: query.startMonth, endYear: query.endYear, endMonth: query.endMonth };

  if (fullOverlapKeys.length === 0) {
    warnings.push('TAIEX 月底收盤與 10 年期公債殖利率完全沒有重疊的月份，無法計算 ERP。');
    const noData: MetricStatus = { status: 'no_data', message: 'TAIEX 與無風險利率查無任何重疊月份。' };
    return {
      windowStart: null,
      windowEnd: null,
      months: 0,
      marketReturnGeometric: null,
      marketReturnArithmetic: null,
      avgRiskFreeRate: null,
      erpGeometric: null,
      erpArithmetic: null,
      requestedWindow,
      clippedToAvailableData: false,
      dataCoverage,
      supplySide: null,
      fieldStatuses: buildFieldStatuses([
        ['marketReturnGeometric', noData],
        ['marketReturnArithmetic', noData],
        ['avgRiskFreeRate', noData],
        ['erpGeometric', noData],
        ['erpArithmetic', noData],
      ]),
      warnings,
    };
  }

  // 預設窗口 = 完整重疊區間（不預設短窗口——歷史法 ERP 樣本越長越可信，見上方 MIN_MONTHS_FOR_RELIABLE_ESTIMATE 說明）。
  const availableStart = fullOverlapKeys[0]!;
  const availableEnd = fullOverlapKeys[fullOverlapKeys.length - 1]!;
  const requestedStartKey = query.startYear !== undefined && query.startMonth !== undefined ? toKey(query.startYear, query.startMonth) : availableStart;
  const requestedEndKey = query.endYear !== undefined && query.endMonth !== undefined ? toKey(query.endYear, query.endMonth) : availableEnd;

  const effectiveStartKey = requestedStartKey < availableStart ? availableStart : requestedStartKey;
  const effectiveEndKey = requestedEndKey > availableEnd ? availableEnd : requestedEndKey;
  const clippedToAvailableData = effectiveStartKey !== requestedStartKey || effectiveEndKey !== requestedEndKey;
  if (clippedToAvailableData) {
    warnings.push(
      `指定窗口 ${requestedStartKey} ~ ${requestedEndKey} 超出實際資料涵蓋範圍（${availableStart} ~ ${availableEnd}），已裁切到實際涵蓋範圍。`,
    );
  }

  const overlapKeys = fullOverlapKeys.filter((k) => k >= effectiveStartKey && k <= effectiveEndKey);
  const months = overlapKeys.length;

  if (months < HARD_MIN_MONTHS) {
    warnings.push(`窗口內只有 ${months} 個重疊月份，至少需要 ${HARD_MIN_MONTHS} 個月才能算出 1 筆報酬率，無法計算。`);
    const calcError: MetricStatus = { status: 'calculation_error', message: `窗口內只有 ${months} 個重疊月份，樣本數不足以計算報酬率。` };
    return {
      windowStart: overlapKeys[0] ?? null,
      windowEnd: overlapKeys[overlapKeys.length - 1] ?? null,
      months,
      marketReturnGeometric: null,
      marketReturnArithmetic: null,
      avgRiskFreeRate: null,
      erpGeometric: null,
      erpArithmetic: null,
      requestedWindow,
      clippedToAvailableData,
      dataCoverage,
      supplySide: null,
      fieldStatuses: buildFieldStatuses([
        ['marketReturnGeometric', calcError],
        ['marketReturnArithmetic', calcError],
        ['avgRiskFreeRate', calcError],
        ['erpGeometric', calcError],
        ['erpArithmetic', calcError],
      ]),
      warnings,
    };
  }

  if (months < MIN_MONTHS_FOR_RELIABLE_ESTIMATE) {
    const years = (months / 12).toFixed(1);
    warnings.push(
      `窗口只有 ${months} 個月（約 ${years} 年），低於建議的可信度門檻 ${MIN_MONTHS_FOR_RELIABLE_ESTIMATE} 個月（20 年）。實測過短窗口（5~10 年）容易受單一段多空行情主導，` +
        `算出的 ERP 可能明顯偏離長期合理區間（例如曾在 5 年窗口算出 ≈21%、10 年窗口 ≈17%，遠高於文獻常見的 4%~8%），請謹慎解讀這個數字，優先採用更長窗口的結果。`,
    );
  }

  const first = taiex[overlapKeys[0]!]!;
  const last = taiex[overlapKeys[months - 1]!]!;
  const periods = months - 1;
  const geometricReturn = Math.pow(last / first, 12 / periods) - 1;

  const monthlyReturns: number[] = [];
  for (let i = 1; i < months; i++) {
    monthlyReturns.push(taiex[overlapKeys[i]!]! / taiex[overlapKeys[i - 1]!]! - 1);
  }
  const arithmeticReturn = mean(monthlyReturns) * 12;
  const avgRf = mean(overlapKeys.map((k) => riskFreeRate[k]!));

  const marketReturnGeometric = round4(geometricReturn * 100);
  const marketReturnArithmetic = round4(arithmeticReturn * 100);
  const avgRiskFreeRate = round4(avgRf);
  const erpGeometric = round4(marketReturnGeometric - avgRiskFreeRate);
  const erpArithmetic = round4(marketReturnArithmetic - avgRiskFreeRate);

  const windowEnd = overlapKeys[months - 1]!;
  const supplySide = computeSupplySide(supplySideSources, overlapKeys[0]!, windowEnd, riskFreeRate[windowEnd] ?? null, warnings);
  if (windowEnd !== availableEnd) {
    warnings.push(`供給面模型的股利殖利率固定取最新交易日（${supplySide?.dividendYieldTradeDate ?? '無'}），不是窗口終點 ${windowEnd} 當時的殖利率；指定過去的窗口時兩者時間點不一致。`);
  }

  // 存進 oingg-analysis DB 的 macro_equity_risk_premiums，PK 用 windowStart+windowEnd——同一組窗口
  // 重算會覆蓋同一列，跟 beta 用 symbol+asOfDate 同一種「結果快取」模式。存檔失敗不應該讓已經
  // 算好的結果回傳失敗（跟 beta/service.ts 的 try/catch 同一種容錯方式）。
  try {
    await deps.macroData.saveEquityRiskPremiumResult({
      windowStart: overlapKeys[0]!,
      windowEnd: overlapKeys[months - 1]!,
      months,
      marketReturnGeometric,
      marketReturnArithmetic,
      avgRiskFreeRate,
      erpGeometric,
      erpArithmetic,
      warnings,
    });
  } catch (error) {
    deps.logger.error({ err: error }, '[equityRiskPremium]: 寫入 macro_equity_risk_premiums 失敗，不影響本次回傳結果。');
  }

  return {
    windowStart: overlapKeys[0]!,
    windowEnd: overlapKeys[months - 1]!,
    months,
    marketReturnGeometric,
    marketReturnArithmetic,
    avgRiskFreeRate,
    erpGeometric,
    erpArithmetic,
    requestedWindow,
    clippedToAvailableData,
    dataCoverage,
    supplySide,
    fieldStatuses: buildFieldStatuses([]),
    warnings,
  };
};
