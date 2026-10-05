import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toMultipleFromThousands } from '@/domain/metrics/shared/numericHelpers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot } from '@/domain/metrics/computation';
import { interestBearingDebt } from '@/domain/metrics/shared/pickers';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingCashFlowStatements, resolveTrailingIncomeStatements } from '@/application/metrics/shared/trailingYear';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——一次查詢
// 資產負債表+損益表+現金流量表，算出 OCF(TTM)/FCF(TTM)/EnterpriseValue/InvestedCapital
// 四個中繼變量，拆出 8 個 TTM-only metricCode。只有 TTM 一種 basis（跟這批全部指標的
// 精神一致：需要 4 季但不用跨 3 年以上，6 季全市場深度剛好夠用）。
//
// EnterpriseValue 沿用 evEbitda/computeEvEbitdaPit.ts 的既有邏輯（netDebt=
// (shortTermBorrowings+bondsPayable+longTermBorrowings)-cash、EV=marketCap+netDebt*1000），
// InvestedCapital 沿用 roic/computeRoicPit.ts 的既有邏輯（totalDebt+equity-cash）——
// 兩者都不抽共用函式，比照本 repo「每個檔案各自重複定義 EV/EBIT」的既有慣例
// （見 evEbitda 檔頭說明：interestCoverage/netDebtToEbitda/roic/roce 四個檔案各自
// 重複定義 EBIT，同一種模式）。
//
// FCF = OCF + capitalExpenditures（capex 本身是 XBRL 投資活動現金流出的負數，跟
// pFcf/fcfYield 既有慣例完全一致，不用另外取絕對值相減）。capexToOcfRatio 展示給
// 使用者的是正的比率，內部才取絕對值。
//
// fcfConversionRate 採用 FCF(TTM)/NetIncome(TTM) 這個定義（衡量帳面獲利有多少比例
// 真的轉換成自由現金流），不是 FCF/OCF 或 FCF/EBITDA 版本——業界對「conversion rate」
// 有多種定義，這裡明確記錄採用的是哪一種。

// 2026-09-28 formulaVersion 3：有息負債補上一年內到期長期負債與應付短期票券（使用者拍板「共用負債補到期」，見 domain/metrics/shared/pickers.ts interestBearingDebt）。
export const CROIC_FORMULA_VERSION = 3;
// 2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
export const CASH_FLOW_VALUATION_MARKET_CAP_FORMULA_VERSION = 2;
// 2026-09-28 formulaVersion 3（evToOcf/evToSales）、2（debtToFcf）：有息負債補上一年內到期長期負債與應付短期票券（使用者拍板「共用負債補到期」，見 domain/metrics/shared/pickers.ts interestBearingDebt）。
const EV_FORMULA_VERSION = 3;
const DEBT_TO_FCF_FORMULA_VERSION = 2;
const FORMULA_VERSION_BY_CODE: Record<string, number> = {
  croic: CROIC_FORMULA_VERSION,
  evToOcf: EV_FORMULA_VERSION,
  evToSales: EV_FORMULA_VERSION,
  priceToOcf: CASH_FLOW_VALUATION_MARKET_CAP_FORMULA_VERSION,
  debtToFcf: DEBT_TO_FCF_FORMULA_VERSION,
};

const toPctFromThousands = (numeratorInThousands: bigint, denominatorInThousands: bigint): number | null => {
  if (denominatorInThousands === 0n) return null;
  return Math.round((Number(numeratorInThousands) / Number(denominatorInThousands)) * 100 * 100) / 100;
};

const toRatioFromThousands = (numeratorInThousands: bigint, denominatorInThousands: bigint): number | null => {
  if (denominatorInThousands === 0n) return null;
  return Math.round((Number(numeratorInThousands) / Number(denominatorInThousands)) * 100) / 100;
};


export type CashFlowValuationFamilyDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'market' | 'cumulativeStatements'>;

export type CashFlowValuationFamilyComputationBatch = ComputationBatch<'evToOcf' | 'evToSales' | 'priceToOcf' | 'debtToFcf' | 'capexToOcfRatio' | 'croic' | 'ocfMargin' | 'fcfConversionRate' | 'ocfMarginQ' | 'fcfConversionRateQ'>;

// 2026-10-01 溯源表（croic／capexToOcfRatio／debtToFcf／fcfConversionRate／evToOcf／evToSales／priceToOcf／ocfMargin 八支
// get<Metric>Provenance.ts）要跟寫入路徑算出同一個數字：以前各自「只查自己真正的依賴」重算，結果漏了 croic ×100（v2）、
// 分母 ≤ 0 守門、家族共用的 ttmComplete 旗標（金控沒有營業收入 → 寫入 insufficient_history，溯源卻有值），全部漂掉。
// 現在查詢、加總、八個值抽成這支 resolver 共用，computeCashFlowValuationFamily 只負責 knowledge date 與組 slot；計算本身逐字未改。
// values 只在 ttmComplete 時有值（不齊時寫入路徑寫 insufficient_history），溯源表直接取用就跟寫入的列一致。
export const resolveCashFlowValuationInputs = async (query: QuarterlyMetricQuery, deps: CashFlowValuationFamilyDeps) => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement, cashFlowStatement] = await Promise.all([
    deps.statements.getBalanceSheet(key),
    deps.statements.getIncomeStatement(key),
    deps.statements.getCashFlowStatement(key),
  ]);

  const totalDebt = balanceSheet
    ? interestBearingDebt(balanceSheet)
    : null;
  const cashAndEquivalents = balanceSheet?.cashAndEquivalents ?? null;
  const netDebt = totalDebt !== null && cashAndEquivalents !== null ? totalDebt - cashAndEquivalents : null;
  const equity = balanceSheet?.equityAttributableToParent ?? balanceSheet?.totalEquity ?? null;
  const investedCapital = totalDebt !== null && equity !== null && cashAndEquivalents !== null ? totalDebt + equity - cashAndEquivalents : null;

  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const marketCap = mainAnchor ? await deps.market.getMarketCap(symbol, mainAnchor.knowledgeDate) : null;
  const enterpriseValue = marketCap !== null && netDebt !== null ? marketCap.marketCap + Number(netDebt) * 1000 : null;

  // TTM：近四季（含本季）OCF/Capex/Revenue/NetIncome 各自加總；EV/InvestedCapital
  // 沿用上面同一筆，不另外重查（跟 evEbitda 的做法一致）。
  // 2026-10-01 近一年改走共用來源（興櫃半年頻，見 shared/trailingYear.ts）；兩張表的 periods 順序相同、逐段配對。
  const trailingKey = { symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId };
  const [trailingIncome, trailingCashFlow] = await Promise.all([resolveTrailingIncomeStatements(trailingKey, deps), resolveTrailingCashFlowStatements(trailingKey, deps)]);
  const ttmQuarters = trailingIncome.periods;
  const ttmRecords = trailingIncome.periods.map((p, i) => [p.record, trailingCashFlow.periods[i]?.record ?? null] as const);

  let ocfTtmSum = 0n;
  let capexTtmSum = 0n;
  let revenueTtmSum = 0n;
  let netIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const [incomeRecord, cashFlowRecord] of ttmRecords) {
    if (
      incomeRecord === null ||
      cashFlowRecord === null ||
      incomeRecord.operatingRevenue === null ||
      incomeRecord.netIncome === null ||
      cashFlowRecord.netCashFromOperatingActivities === null ||
      cashFlowRecord.capitalExpenditures === null
    ) {
      ttmComplete = false;
    } else {
      ocfTtmSum += cashFlowRecord.netCashFromOperatingActivities;
      capexTtmSum += cashFlowRecord.capitalExpenditures;
      revenueTtmSum += incomeRecord.operatingRevenue;
      netIncomeTtmSum += incomeRecord.netIncome;
    }
  }
  const fcfTtmSum = ocfTtmSum + capexTtmSum; // capex 是負數，加總即為扣除。

  const evToOcfValue = ttmComplete && enterpriseValue !== null ? toMultipleFromThousands(enterpriseValue, ocfTtmSum) : null;
  const evToSalesValue = ttmComplete && enterpriseValue !== null ? toMultipleFromThousands(enterpriseValue, revenueTtmSum) : null;
  const priceToOcfValue = ttmComplete && marketCap !== null ? toMultipleFromThousands(marketCap.marketCap, ocfTtmSum) : null;
  // 2026-09-22 公式稽核：debtToFcf（幾年還完）、capexToOcfRatio（OCF 有幾成拿去投資）、fcfConversionRate（獲利幾成變現金）
  // 在分母 ≤ 0 時符號翻轉、數值爆掉（全市場 p95 曾到 486%、max 96961%），一律 zero_or_negative_denominator（v1 只擋 = 0）。
  // 估值倍數（evToOcf/priceToOcf/evToSales）維持跟 peRatio 一樣的慣例：為負仍照算不隱藏。
  const debtToFcfValue = ttmComplete && totalDebt !== null && fcfTtmSum > 0n ? toRatioFromThousands(totalDebt, fcfTtmSum) : null;
  const capexToOcfRatioValue = ttmComplete && ocfTtmSum > 0n ? toPctFromThousands(capexTtmSum < 0n ? -capexTtmSum : capexTtmSum, ocfTtmSum) : null;
  // 2026-09-22 公式稽核抓到：croic 的 unit 是 %，但原本用 toRatioFromThousands（沒乘 100），全市場中位數 0.11 = 實際 11%。
  // 改 toPctFromThousands，formulaVersion 2，全市場重算。
  const croicValue = ttmComplete && investedCapital !== null ? toPctFromThousands(fcfTtmSum, investedCapital) : null;
  const ocfMarginValue = ttmComplete ? toPctFromThousands(ocfTtmSum, revenueTtmSum) : null;
  const fcfConversionRateValue = ttmComplete && netIncomeTtmSum > 0n ? toPctFromThousands(fcfTtmSum, netIncomeTtmSum) : null;

  // 2026-10-05 單季（Q）：web-nuxt 指標頁要期別切換器（使用者：有頁面要用再做）。本季單季現金流量表／損益表，公式同 TTM；
  // fcfConversionRate 淨利 ≤ 0 同樣不算。興櫃沒有單季列 → missing_input（結構性，跟其他單季指標一樣）。溯源表維持近四季。
  const ocfQ = cashFlowStatement?.netCashFromOperatingActivities ?? null;
  const capexQ = cashFlowStatement?.capitalExpenditures ?? null;
  const revenueQ = incomeStatement?.operatingRevenue ?? null;
  const netIncomeQ = incomeStatement?.netIncome ?? null;
  const quarterInputs = { ocfMargin: ocfQ !== null && revenueQ !== null, fcfConversionRate: ocfQ !== null && capexQ !== null && netIncomeQ !== null };
  const quarterValues = {
    ocfMargin: quarterInputs.ocfMargin && revenueQ! !== 0n ? toPctFromThousands(ocfQ!, revenueQ!) : null,
    fcfConversionRate: quarterInputs.fcfConversionRate && netIncomeQ! > 0n ? toPctFromThousands(ocfQ! + capexQ!, netIncomeQ!) : null,
  };

  return {
    symbol, year, season, rocYear, seasonNum, fiscalYear,
    balanceSheet, totalDebt, cashAndEquivalents, netDebt, equity, investedCapital,
    mainAnchor, marketCap, enterpriseValue,
    trailingIncome, trailingCashFlow, ttmQuarters, ttmRecords, ttmComplete,
    ocfTtmSum, capexTtmSum, revenueTtmSum, netIncomeTtmSum, fcfTtmSum,
    quarterInputs, quarterValues,
    values: {
      evToOcf: evToOcfValue,
      evToSales: evToSalesValue,
      priceToOcf: priceToOcfValue,
      debtToFcf: debtToFcfValue,
      capexToOcfRatio: capexToOcfRatioValue,
      croic: croicValue,
      ocfMargin: ocfMarginValue,
      fcfConversionRate: fcfConversionRateValue,
    },
  };
};

export type CashFlowValuationResolution = NonNullable<Awaited<ReturnType<typeof resolveCashFlowValuationInputs>>>;

export const computeCashFlowValuationFamily = async (
  query: QuarterlyMetricQuery,
  deps: CashFlowValuationFamilyDeps
): Promise<CashFlowValuationFamilyComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skipped = (action: 'skipped_no_quarter'): CashFlowValuationFamilyComputationBatch => ({
    symbol,
    rocYear: null,
    season: null,
    slots: {
      evToOcf: { action },
      evToSales: { action },
      priceToOcf: { action },
      debtToFcf: { action },
      capexToOcfRatio: { action },
      croic: { action },
      ocfMargin: { action },
      fcfConversionRate: { action },
      ocfMarginQ: { action },
      fcfConversionRateQ: { action },
    },
  });

  const resolution = await resolveCashFlowValuationInputs(query, deps);

  if (!resolution) return skipped('skipped_no_quarter');

  const { year, season, seasonNum, fiscalYear, totalDebt, investedCapital, mainAnchor, marketCap, enterpriseValue, ttmQuarters, ttmRecords, ttmComplete, values, quarterInputs, quarterValues } = resolution;

  // 單季兩支跟 TTM 是否齊全無關，錨在本季公告日。
  const quarterSlot = (metricCode: 'ocfMargin' | 'fcfConversionRate'): ComputationSlot => {
    if (!mainAnchor) return { action: 'skipped_no_knowledge_date' };
    const value = quarterValues[metricCode];
    const nullReason: MetricNullReason | null = value !== null ? null : quarterInputs[metricCode] ? 'zero_or_negative_denominator' : 'missing_input';
    return computation({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId, ...periodTypeGroup('Q'), value, nullReason, knowledgeDate: mainAnchor.knowledgeDate, knowledgeDateIsFallback: mainAnchor.isFallback, formulaVersion: FORMULA_VERSION_BY_CODE[metricCode] });
  };
  const ocfMarginQ = quarterSlot('ocfMargin');
  const fcfConversionRateQ = quarterSlot('fcfConversionRate');

  const coordinateBase = { symbol, metricCode: '', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };
  const coordinateFor = (metricCode: string) => ({ ...coordinateBase, metricCode });

  if (!ttmComplete) {
    if (!mainAnchor) return skipped('skipped_no_quarter');
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    const insufficientHistory = (metricCode: string): ComputationSlot =>
      computation({ ...coordinateFor(metricCode), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback, formulaVersion: FORMULA_VERSION_BY_CODE[metricCode] });

    return {
      symbol,
      rocYear: year,
      season,
      slots: {
        evToOcf: insufficientHistory('evToOcf'),
        evToSales: insufficientHistory('evToSales'),
        priceToOcf: insufficientHistory('priceToOcf'),
        debtToFcf: insufficientHistory('debtToFcf'),
        capexToOcfRatio: insufficientHistory('capexToOcfRatio'),
        croic: insufficientHistory('croic'),
        ocfMargin: insufficientHistory('ocfMargin'),
        fcfConversionRate: insufficientHistory('fcfConversionRate'),
        ocfMarginQ,
        fcfConversionRateQ,
      },
    };
  }

  if (!mainAnchor) return skipped('skipped_no_quarter');

  const ttmAnchor = await resolveKnowledgeDate(
    symbol,
    ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]![0]?.reportDate ?? null })), deps.announcements
  );
  if (!ttmAnchor) return skipped('skipped_no_quarter');
  const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;

  const nullReasonFor = (value: number | null, ...inputsAvailable: boolean[]): MetricNullReason | null => {
    if (value !== null) return null;
    return inputsAvailable.every(Boolean) ? 'zero_or_negative_denominator' : 'missing_input';
  };

  const write = (metricCode: string, value: number | null, nullReason: MetricNullReason | null): ComputationSlot =>
    computation({ ...coordinateFor(metricCode), ...periodTypeGroup('TTM'), value, nullReason, knowledgeDate, knowledgeDateIsFallback, formulaVersion: FORMULA_VERSION_BY_CODE[metricCode] });

  const evToOcf = write('evToOcf', values.evToOcf, nullReasonFor(values.evToOcf, enterpriseValue !== null));
  const evToSales = write('evToSales', values.evToSales, nullReasonFor(values.evToSales, enterpriseValue !== null));
  const priceToOcf = write('priceToOcf', values.priceToOcf, nullReasonFor(values.priceToOcf, marketCap !== null));
  const debtToFcf = write('debtToFcf', values.debtToFcf, nullReasonFor(values.debtToFcf, totalDebt !== null));
  const capexToOcfRatio = write('capexToOcfRatio', values.capexToOcfRatio, nullReasonFor(values.capexToOcfRatio, true));
  const croic = write('croic', values.croic, nullReasonFor(values.croic, investedCapital !== null));
  const ocfMargin = write('ocfMargin', values.ocfMargin, nullReasonFor(values.ocfMargin, true));
  const fcfConversionRate = write('fcfConversionRate', values.fcfConversionRate, nullReasonFor(values.fcfConversionRate, true));

  return { symbol, rocYear: year, season, slots: { evToOcf, evToSales, priceToOcf, capexToOcfRatio, debtToFcf, croic, ocfMargin, fcfConversionRate, ocfMarginQ, fcfConversionRateQ } };
};
