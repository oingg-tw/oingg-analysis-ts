import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPercent } from '@/domain/metrics/shared/numericHelpers';
import { pickEquity, interestBearingDebt } from '@/domain/metrics/shared/pickers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, withFormulaVersion } from '@/domain/metrics/computation';

// 2026-09-28 formulaVersion 2：有息負債補上一年內到期長期負債與應付短期票券（使用者拍板「共用負債補到期」，見 domain/metrics/shared/pickers.ts interestBearingDebt）。
const DE_RATIO_FORMULA_VERSION = 2;
import type { PitDeps } from '@/application/metrics/deps';

// 這份檔案是 src/domainMetrics/deRatio.ts 的獨立重新實作。純資產負債表時點快照，只有 Q
// 一種 basis。負權益仍算出真實但扭曲的數字，不算 null（跟 roe.ts 現有對外行為一致）。


export type DeRatioDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type DeRatioComputationBatch = ComputationBatch<'q'>;

export const computeDeRatio = async (query: QuarterlyMetricQuery, deps: DeRatioDeps): Promise<DeRatioComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const balanceSheet = await deps.statements.getBalanceSheet(key);
  const equity = pickEquity(balanceSheet);
  const reportDate = balanceSheet?.reportDate ?? null;

  const totalDebt = balanceSheet
    ? interestBearingDebt(balanceSheet)
    : null;

  const deRatioPct = totalDebt !== null && equity.value !== null ? toPercent(totalDebt, equity.value) : null;
  const nullReason: MetricNullReason | null = deRatioPct === null ? determineNullReason(totalDebt, equity.value) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  let q: ComputationSlot;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = computation({
      symbol,
      metricCode: 'deRatio',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value: deRatioPct,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, slots: withFormulaVersion({ q }, DE_RATIO_FORMULA_VERSION) };
};
