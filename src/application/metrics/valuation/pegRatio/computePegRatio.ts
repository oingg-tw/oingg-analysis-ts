import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPerShareExact } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { isComputationSkip, computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveTrailingIncomeStatements, type TrailingYear } from '@/application/metrics/shared/trailingYear';
import type { IncomeStatementFields } from '@/application/ports/financialStatements';
import type { OutstandingCommonSharesAsOf } from '@/application/ports/capitalStock';

// 2026-09-22 formulaVersion 2：中繼 EPS/PER/五年 CAGR 都不再各自四捨五入，只在最後的 PEG 四捨五入一次（見 numericHelpers.ts toPerShareExact 的說明）。
// 2026-09-26 formulaVersion 3：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
// 2026-09-27 formulaVersion 4：跨期比較的每股數字做面額還原（股票分割不算每股價值變化，IAS 33 追溯調整前期；使用者：「盡可能反映內在價值的變化」）。
// 2026-09-28 formulaVersion 5：跨期還原加上股票股利（配股）與股數合併式減資（使用者：「只是股數變了、公司價值沒變」的都換算，IAS 33 對配股、分割、反分割都追溯調整）。
export const PEG_RATIO_FORMULA_VERSION = 5;

// 本益成長比（PEG，Peter Lynch，《One Up on Wall Street》1989）= PER(TTM) / EPS 5年複合
// 成長率(%)。PER 的算法直接複製自 peRatio/computePeRatioPit.ts 的 TTM 邏輯，EPS 5 年 CAGR
// 的算法直接複製自 epsCagr/computeEpsCagrFamilyPit.ts（固定只取 5 年，不做 3/8 年版本——
// PEG 原始概念本身沒有 3/5/8 年可選版本，5 年是最常見的業界慣例），獨立重新計算，不依賴
// peRatio/epsCagr5y 這兩個 metric_code 已寫入的值，保持每支 PIT 檔案獨立、不互相依賴的
// 既有原則。成長率 ≤ 0（獲利衰退或虧損）時 PEG 沒有意義，回傳 null——跟 epsCagr 本身的
// zero_or_negative_denominator 判斷一致。只有 TTM 一種 basis（沿用 peRatio 的基準）。

export const PEG_GROWTH_YEARS = 5;

// 2026-10-01 回傳明細（近一年各期淨利、股數、面額還原倍數）讓溯源表（getPegRatioProvenance.ts）直接列出計算真正用的數字；
// eps 的算法逐字未改。
export interface AnnualEps {
  eps: number | null;
  trailing: TrailingYear<IncomeStatementFields>;
  q4ReportDate: Date | null;
  shares: OutstandingCommonSharesAsOf | null;
  splitFactor: number | null;
}

// 年度 EPS = 4 季淨利加總（歸屬母公司優先，缺漏退回整體口徑）/ 當年 Q4 報告日流通股數，
// 跟 epsCagr 家族同一套邏輯。
// 面額還原：每一年的每股數字都換算到「所有已知面額變更之後」的股數基準，CAGR 比的是兩年比值，基準日選哪天都會抵銷。
// 每次呼叫才建立（模組載入時建的 Date 常數在錄製器凍結 Date 之後會被當成非 Date 編碼，cassette 對不上）。
const splitRestateBasis = (): Date => new Date(Date.UTC(9999, 0, 1));
const getAnnualEps = async (
  cache: Map<number, AnnualEps>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string,
  deps: PegRatioDeps
): Promise<AnnualEps> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  // 2026-10-01 全年改走共用近一年來源（截至 Q4 的近一年＝全年；興櫃半年頻＝上半年＋下半年，見 shared/trailingYear.ts）。
  // 最後一段的 reportDate 上市櫃＝Q4 單季那筆（跟原本相同）、興櫃＝年報累計那筆，同樣是年底。
  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: '4', dataType, subsidiaryCompanyId }, deps);
  const quarters = trailing.periods.map((p) => p.record);
  if (quarters.some((q) => q === null || pickNetIncome(q).value === null)) {
    const result: AnnualEps = { eps: null, trailing, q4ReportDate: null, shares: null, splitFactor: null };
    cache.set(rocYear, result);
    return result;
  }

  const netIncomeSum = quarters.reduce((sum, q) => sum + pickNetIncome(q).value!, 0n);
  const q4ReportDate = quarters.at(-1)!.reportDate;
  const shares = await deps.shares.getOutstandingCommonShares(symbol, q4ReportDate);
  if (!shares) {
    const result: AnnualEps = { eps: null, trailing, q4ReportDate, shares: null, splitFactor: null };
    cache.set(rocYear, result);
    return result;
  }

  // 2026-09-25 分子只算普通股：全年淨利扣全年特別股股利（第四季報告日的近四季＝全年），見 domain/financials/outstandingCommonShares.ts。
  const value = (Number(netIncomeSum - shares.preferredDividendsTtmThousands) * 1000) / Number(shares.outstandingCommonShares);
  const splitFactor = await deps.shares.getShareSplitFactor(symbol, q4ReportDate, splitRestateBasis());
  const restated = value / splitFactor;
  const result: AnnualEps = { eps: restated, trailing, q4ReportDate, shares, splitFactor };
  cache.set(rocYear, result);
  return result;
};


export type PegRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares' | 'market' | 'cumulativeStatements'>;

export type PegRatioComputationBatch = ComputationBatch<'ttm'>;

// 2026-10-01 溯源表（getPegRatioProvenance.ts）要跟寫入路徑算出同一個數字：原本溯源表自己重算，中繼 EPS/PER/CAGR 各自四捨五入
// （v2 已改成只在最後四捨五入一次）、沒扣特別股股利（v3）、年度 EPS 也沒做面額／配股還原（v4/v5）。查詢與值抽成這支 resolver
// 共用，computePegRatio 只負責組 slot；計算本身逐字未改。
export const resolvePegRatioInputs = async (query: QuarterlyMetricQuery, deps: PegRatioDeps) => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return null;
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const mainIncomeStatement = await deps.statements.getIncomeStatement(key);
  const reportDate = mainIncomeStatement?.reportDate ?? null;

  const shares = reportDate ? await deps.shares.getOutstandingCommonShares(symbol, reportDate) : null;
  const sharesValue = shares?.outstandingCommonShares ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const stockPrice = mainAnchor ? await deps.market.getStockPrice(symbol, mainAnchor.knowledgeDate, reportDate ?? undefined) : null;

  // PER(TTM)：近四季（含本季）淨利加總 / 流通股數，跟 peRatio 的 TTM 算法完全相同。
  // 2026-10-01 近一年改走共用來源（興櫃半年頻，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmRecords = trailing.periods.map((p) => p.record);

  let ttmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    const picked = pickNetIncome(record);
    if (picked.value === null) {
      ttmComplete = false;
    } else {
      ttmSum += picked.value;
    }
  }

  const epsTtm = ttmComplete && sharesValue !== null ? toPerShareExact(ttmSum - (shares?.preferredDividendsTtmThousands ?? 0n), sharesValue) : null;
  const peRatioTtm = epsTtm !== null && epsTtm !== 0 && stockPrice !== null ? stockPrice.closePrice / epsTtm : null;

  // EPS 5 年複合成長率——固定 5 年，取「最近一個資料完整的完整會計年度」跟「5 年前的那個
  // 完整會計年度」。
  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const epsCache = new Map<number, AnnualEps>();
  const currentAnnual = await getAnnualEps(epsCache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, deps);
  const priorAnnual = await getAnnualEps(epsCache, symbol, latestCompleteFiscalYear - PEG_GROWTH_YEARS, dataType, subsidiaryCompanyId, deps);

  const currentAnnualEps = currentAnnual.eps;
  const priorAnnualEps = priorAnnual.eps;

  const epsCagr5yPct =
    currentAnnualEps !== null && priorAnnualEps !== null && currentAnnualEps > 0 && priorAnnualEps > 0
      ? (Math.pow(currentAnnualEps / priorAnnualEps, 1 / PEG_GROWTH_YEARS) - 1) * 100
      : null;

  const pegRatio = peRatioTtm !== null && epsCagr5yPct !== null && epsCagr5yPct > 0 ? Math.round((peRatioTtm / epsCagr5yPct) * 100) / 100 : null;

  let nullReason: MetricNullReason | null = null;
  if (pegRatio === null) {
    if (!ttmComplete) nullReason = 'insufficient_history';
    else if (epsTtm === null || stockPrice === null || currentAnnualEps === null || priorAnnualEps === null) nullReason = 'missing_input';
    else nullReason = 'zero_or_negative_denominator';
  }

  return {
    symbol, year, season, rocYear, seasonNum, fiscalYear, shares, sharesValue, mainAnchor, stockPrice, trailing, ttmComplete, ttmSum, epsTtm, peRatioTtm,
    latestCompleteFiscalYear, currentAnnual, priorAnnual, epsCagr5yPct, pegRatio, nullReason,
  };
};

export const computePegRatio = async (
  query: QuarterlyMetricQuery,
  deps: PegRatioDeps
): Promise<PegRatioComputationBatch> => {
  const { dataType, subsidiaryCompanyId } = query;
  const resolution = await resolvePegRatioInputs(query, deps);

  if (!resolution) {
    return noQuarterBatch(query.symbol, ['ttm']);
  }

  const { symbol, year, season, seasonNum, fiscalYear, mainAnchor, pegRatio, nullReason } = resolution;

  let ttm: ComputationSlot;
  if (!mainAnchor) {
    ttm = { action: 'skipped_no_knowledge_date' };
  } else {
    ttm = computation({
      symbol,
      metricCode: 'pegRatio',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('TTM'),
      value: pegRatio,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, slots: { ttm: isComputationSkip(ttm) ? ttm : { ...ttm, formulaVersion: PEG_RATIO_FORMULA_VERSION } } };
};
