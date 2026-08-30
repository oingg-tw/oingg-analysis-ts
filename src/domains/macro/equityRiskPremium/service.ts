import twsePrisma from '@/adapters/prisma/twseClient';
import cbcPrisma from '@/adapters/prisma/cbcClient';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { buildFieldStatuses, type MetricStatus } from '@/shared/metricStatus';
import type { EquityRiskPremiumQuery, EquityRiskPremiumResult } from './types';

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

const getTaiexMonthEndCloses = async (): Promise<Record<string, number>> => {
  const rows = await twsePrisma.dailyTaiexIndex.findMany({
    orderBy: { tradeDate: 'asc' },
    select: { tradeDate: true, close: true },
  });
  const monthEnd: Record<string, number> = {};
  for (const row of rows) {
    if (row.close === null) continue;
    const key = toKey(row.tradeDate.getUTCFullYear(), row.tradeDate.getUTCMonth() + 1);
    monthEnd[key] = Number(row.close); // 依日期升冪走訪，同一個月份會被後面較晚的交易日覆寫，最後留下的就是該月最後一個收盤價
  }
  return monthEnd;
};

const getRiskFreeRateByMonth = async (): Promise<Record<string, number>> => {
  const rows = await cbcPrisma.monthlyGovBondYield10y.findMany({ orderBy: [{ year: 'asc' }, { month: 'asc' }] });
  const byMonth: Record<string, number> = {};
  for (const row of rows) {
    byMonth[toKey(row.year, row.month)] = Number(row.yieldRate);
  }
  return byMonth;
};

export const calculateEquityRiskPremium = async (query: EquityRiskPremiumQuery): Promise<EquityRiskPremiumResult> => {
  const warnings: string[] = [];
  const [taiex, riskFreeRate] = await Promise.all([getTaiexMonthEndCloses(), getRiskFreeRateByMonth()]);

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

  // 存進 oingg-analysis DB 的 macro_equity_risk_premium，PK 用 windowStart+windowEnd——同一組窗口
  // 重算會覆蓋同一列，跟 beta 用 symbol+asOfDate 同一種「結果快取」模式。存檔失敗不應該讓已經
  // 算好的結果回傳失敗（跟 beta/service.ts 的 try/catch 同一種容錯方式）。
  try {
    await analysisPrisma.equityRiskPremiumResult.upsert({
      where: { windowStart_windowEnd: { windowStart: overlapKeys[0]!, windowEnd: overlapKeys[months - 1]! } },
      create: {
        windowStart: overlapKeys[0]!,
        windowEnd: overlapKeys[months - 1]!,
        months,
        marketReturnGeometric,
        marketReturnArithmetic,
        avgRiskFreeRate,
        erpGeometric,
        erpArithmetic,
        warnings,
      },
      update: {
        months,
        marketReturnGeometric,
        marketReturnArithmetic,
        avgRiskFreeRate,
        erpGeometric,
        erpArithmetic,
        warnings,
      },
    });
  } catch (error) {
    console.error('[equityRiskPremium]: 寫入 macro_equity_risk_premium 失敗，不影響本次回傳結果。', error);
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
    fieldStatuses: buildFieldStatuses([]),
    warnings,
  };
};
