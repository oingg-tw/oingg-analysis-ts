import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPercent } from '@/domain/metrics/shared/numericHelpers';
import { pickEquityValue as pickEquity, interestBearingDebt } from '@/domain/metrics/shared/pickers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, withFormulaVersion } from '@/domain/metrics/computation';

// 2026-09-28 formulaVersion 2：有息負債補上一年內到期長期負債與應付短期票券（使用者拍板「共用負債補到期」，見 domain/metrics/shared/pickers.ts interestBearingDebt）。
const TOTAL_DEBT_TO_CAPITAL_FORMULA_VERSION = 2;
import type { PitDeps } from '@/application/metrics/deps';

// 量化選股盤點使用者要求新增。有息負債定義同 evEbitda/evToEbit（短期借款+應付公司債+
// 長期借款），權益 pickEquity 慣例同 altmanZDoublePrimeScore。純資產負債表時點快照，
// 只有 Q 一種 basis。


export type TotalDebtToCapitalDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type TotalDebtToCapitalComputationBatch = ComputationBatch<'q'>;

export const computeTotalDebtToCapital = async (query: QuarterlyMetricQuery, deps: TotalDebtToCapitalDeps): Promise<TotalDebtToCapitalComputationBatch> => {
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
  const totalDebt = balanceSheet
    ? interestBearingDebt(balanceSheet)
    : null;
  const equity = pickEquity(balanceSheet);
  const reportDate = balanceSheet?.reportDate ?? null;

  const denominator = totalDebt !== null && equity !== null ? totalDebt + equity : null;
  const value = totalDebt !== null && denominator !== null ? toPercent(totalDebt, denominator) : null;
  const nullReason: MetricNullReason | null = value === null ? determineNullReason(totalDebt, denominator) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  let q: ComputationSlot;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = computation({
      symbol,
      metricCode: 'totalDebtToCapital',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, slots: withFormulaVersion({ q }, TOTAL_DEBT_TO_CAPITAL_FORMULA_VERSION) };
};
