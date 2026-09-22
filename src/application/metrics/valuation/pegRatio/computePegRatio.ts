import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPerShareExact } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { isComputationSkip, computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-22 formulaVersion 2：中繼 EPS/PER/五年 CAGR 都不再各自四捨五入，只在最後的 PEG 四捨五入一次（見 numericHelpers.ts toPerShareExact 的說明）。
export const PEG_RATIO_FORMULA_VERSION = 2;

// 本益成長比（PEG，Peter Lynch，《One Up on Wall Street》1989）= PER(TTM) / EPS 5年複合
// 成長率(%)。PER 的算法直接複製自 peRatio/computePeRatioPit.ts 的 TTM 邏輯，EPS 5 年 CAGR
// 的算法直接複製自 epsCagr/computeEpsCagrFamilyPit.ts（固定只取 5 年，不做 3/8 年版本——
// PEG 原始概念本身沒有 3/5/8 年可選版本，5 年是最常見的業界慣例），獨立重新計算，不依賴
// peRatio/epsCagr5y 這兩個 metric_code 已寫入的值，保持每支 PIT 檔案獨立、不互相依賴的
// 既有原則。成長率 ≤ 0（獲利衰退或虧損）時 PEG 沒有意義，回傳 null——跟 epsCagr 本身的
// zero_or_negative_denominator 判斷一致。只有 TTM 一種 basis（沿用 peRatio 的基準）。

const PEG_GROWTH_YEARS = 5;

// 年度 EPS = 4 季淨利加總（歸屬母公司優先，缺漏退回整體口徑）/ 當年 Q4 報告日流通股數，
// 跟 epsCagr 家族同一套邏輯。
const getAnnualEps = async (
  cache: Map<number, number | null>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string,
  deps: PegRatioDeps
): Promise<number | null> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((quarter) => deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  if (quarters.some((q) => q === null || pickNetIncome(q).value === null)) {
    cache.set(rocYear, null);
    return null;
  }

  const netIncomeSum = quarters.reduce((sum, q) => sum + pickNetIncome(q).value!, 0n);
  const q4ReportDate = quarters[3]!.reportDate;
  const shares = await deps.shares.getPaidInShares(symbol, q4ReportDate);
  if (!shares) {
    cache.set(rocYear, null);
    return null;
  }

  const value = (Number(netIncomeSum) * 1000) / Number(shares.paidInShares);
  cache.set(rocYear, value);
  return value;
};


export type PegRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares' | 'market'>;

export type PegRatioComputationBatch = ComputationBatch<'ttm'>;

export const computePegRatio = async (
  query: QuarterlyMetricQuery,
  deps: PegRatioDeps
): Promise<PegRatioComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const mainIncomeStatement = await deps.statements.getIncomeStatement(key);
  const reportDate = mainIncomeStatement?.reportDate ?? null;

  const shares = reportDate ? await deps.shares.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const stockPrice = mainAnchor ? await deps.market.getStockPrice(symbol, mainAnchor.knowledgeDate) : null;

  // PER(TTM)：近四季（含本季）淨利加總 / 流通股數，跟 peRatio 的 TTM 算法完全相同。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

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

  const epsTtm = ttmComplete && sharesValue !== null ? toPerShareExact(ttmSum, sharesValue) : null;
  const peRatioTtm = epsTtm !== null && epsTtm !== 0 && stockPrice !== null ? stockPrice.closePrice / epsTtm : null;

  // EPS 5 年複合成長率——固定 5 年，取「最近一個資料完整的完整會計年度」跟「5 年前的那個
  // 完整會計年度」。
  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const epsCache = new Map<number, number | null>();
  const currentAnnualEps = await getAnnualEps(epsCache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, deps);
  const priorAnnualEps = await getAnnualEps(epsCache, symbol, latestCompleteFiscalYear - PEG_GROWTH_YEARS, dataType, subsidiaryCompanyId, deps);

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
