import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { EPS_CAGR_YEARS } from '../../../../domain/metrics/growth/epsCagr/epsCagrDefinition';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, withFormulaVersion } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
// 2026-09-27 formulaVersion 3：跨期比較的每股數字做面額還原（股票分割不算每股價值變化，IAS 33 追溯調整前期；使用者：「盡可能反映內在價值的變化」）。
export const EPS_CAGR_FORMULA_VERSION = 3;

// EPS 3/5/8 年複合成長率——同一組年度 EPS 快取，拆多個回溯窗口，跟 revenueCagr 家族同一套
// 設計。年度 EPS = 4 季淨利加總（歸屬母公司優先，缺漏退回整體口徑）/ 當年 Q4 報告日流通股數。
// 面額還原：每一年的每股數字都換算到「所有已知面額變更之後」的股數基準，CAGR 比的是兩年比值，基準日選哪天都會抵銷。
// 每次呼叫才建立（模組載入時建的 Date 常數在錄製器凍結 Date 之後會被當成非 Date 編碼，cassette 對不上）。
const splitRestateBasis = (): Date => new Date(Date.UTC(9999, 0, 1));
const getAnnualEps = async (
  cache: Map<number, number | null>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string,
  deps: EpsCagrFamilyDeps
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
  const shares = await deps.shares.getOutstandingCommonShares(symbol, q4ReportDate);
  if (!shares) {
    cache.set(rocYear, null);
    return null;
  }

  // 金額單位是千元，股數是實際股數，分子要先 x1000 換算成元（跟 eps.ts 等既有慣例一致）。
  // 2026-09-25 分子只算普通股：全年淨利扣全年特別股股利（第四季報告日的近四季＝全年），見 domain/financials/outstandingCommonShares.ts。
  const value = (Number(netIncomeSum - shares.preferredDividendsTtmThousands) * 1000) / Number(shares.outstandingCommonShares);
  const restated = value / (await deps.shares.getShareSplitFactor(symbol, q4ReportDate, splitRestateBasis()));
  cache.set(rocYear, restated);
  return restated;
};

export type EpsCagrFamilyDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

// slot key 是 `epsCagr${N}y`（3/5/8），舊 outcome 把它們巢狀在 results 底下（shim 用 runLegacyPitNested 包回去）。
export type EpsCagrFamilyComputationBatch = ComputationBatch<string>;

export const computeEpsCagrFamily = async (
  query: QuarterlyMetricQuery,
  deps: EpsCagrFamilyDeps
): Promise<EpsCagrFamilyComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, slots: Object.fromEntries(EPS_CAGR_YEARS.map((y) => [`epsCagr${y}y`, { action: 'skipped_no_quarter' as const }])) };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainIncomeStatement = await deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: mainIncomeStatement?.reportDate ?? null }], deps.announcements);

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const cache = new Map<number, number | null>();
  const currentEps = await getAnnualEps(cache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, deps);

  const results: Record<string, ComputationSlot> = {};

  for (const years of EPS_CAGR_YEARS) {
    const metricCode = `epsCagr${years}y`;
    const priorEps = await getAnnualEps(cache, symbol, latestCompleteFiscalYear - years, dataType, subsidiaryCompanyId, deps);

    const cagrPct =
      currentEps !== null && priorEps !== null && currentEps > 0 && priorEps > 0
        ? Math.round((Math.pow(currentEps / priorEps, 1 / years) - 1) * 100 * 100) / 100
        : null;

    let nullReason: MetricNullReason | null = null;
    if (cagrPct === null) {
      nullReason = currentEps === null || priorEps === null ? 'insufficient_history' : 'zero_or_negative_denominator';
    }

    const coordinateBase = { symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

    if (!mainAnchor) {
      results[metricCode] = { action: 'skipped_no_knowledge_date' };
    } else {
      results[metricCode] = computation({
        ...coordinateBase,
        ...periodTypeGroup('FY'),
        value: cagrPct,
        nullReason,
        knowledgeDate: mainAnchor.knowledgeDate,
        knowledgeDateIsFallback: mainAnchor.isFallback,
      });
    }
  }

  return { symbol, rocYear: year, season, slots: withFormulaVersion(results, EPS_CAGR_FORMULA_VERSION) };
};
