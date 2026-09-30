import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPerShare } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-30 新增：每股現金及約當現金。跟 computeBvps 同一種形狀（資產負債表時點快照、只有 Q），分母也是同一個 IAS 33 流通在外
// 普通股數（shares port，股數日期用資產負債表的 reportDate）。分子是全部現金，不扣特別股——現金是公司的資產，不是普通股股東的請求權。
export type CashPerShareDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type CashPerShareComputationBatch = ComputationBatch<'q'>;

export const computeCashPerShare = async (query: QuarterlyMetricQuery, deps: CashPerShareDeps): Promise<CashPerShareComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet'], deps.quarters);
  if (!resolvedQuarter) return noQuarterBatch(symbol, ['q']);

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await deps.statements.getBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const cash = balanceSheet?.cashAndEquivalents ?? null;
  const reportDate = balanceSheet?.reportDate ?? null;

  const shares = reportDate ? await deps.shares.getOutstandingCommonShares(symbol, reportDate) : null;
  const sharesValue = shares?.outstandingCommonShares ?? null;

  const value = cash !== null && sharesValue !== null ? toPerShare(cash, sharesValue) : null;
  const nullReason: MetricNullReason | null = value === null ? determineNullReason(cash, sharesValue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  const q: ComputationSlot = !mainAnchor
    ? { action: 'skipped_no_knowledge_date' }
    : computation({
        symbol,
        metricCode: 'cashPerShare',
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

  return { symbol, rocYear: year, season, slots: { q } };
};
