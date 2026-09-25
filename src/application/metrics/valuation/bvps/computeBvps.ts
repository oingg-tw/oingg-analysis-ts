import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toCommonEquity } from '@/domain/financials/outstandingCommonShares';
import { determineNullReason, toPerShare } from '@/domain/metrics/shared/numericHelpers';
import { pickEquity } from '@/domain/metrics/shared/pickers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, withFormulaVersion } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-26 formulaVersion 2：流通股數改為 IAS 33 流通在外普通股（已發行 − 特別股 − 庫藏股），EPS 類分子扣特別股股利、
// 每股淨值類分子扣特別股股本；讀股數或市值的指標一起跳版，讓下游有訊號知道值變了（使用者 2026-09-26 拍板）。
export const BVPS_FORMULA_VERSION = 2;

// 這份檔案是 src/domainMetrics/bvps.ts 的獨立重新實作。BVPS 是資產負債表時點快照，跟
// equityMultiplier 同一種形狀，只有 Q 一種 basis，沒有 TTM/年化概念。


export type BvpsDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type BvpsComputationBatch = ComputationBatch<'q'>;

export const computeBvps = async (query: QuarterlyMetricQuery, deps: BvpsDeps): Promise<BvpsComputationBatch> => {
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

  const shares = reportDate ? await deps.shares.getOutstandingCommonShares(symbol, reportDate) : null;
  const sharesValue = shares?.outstandingCommonShares ?? null;

  // 2026-09-25 分子只算普通股：權益扣特別股股本（普通股每股淨值），見 domain/financials/outstandingCommonShares.ts。
  const commonEquity = toCommonEquity(equity.value, shares?.preferredCapitalThousands ?? 0n);
  const bvps = commonEquity !== null && sharesValue !== null ? toPerShare(commonEquity, sharesValue) : null;
  const nullReason: MetricNullReason | null = bvps === null ? determineNullReason(equity.value, sharesValue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  let q: ComputationSlot;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = computation({
      symbol,
      metricCode: 'bvps',
      fiscalYear,
      fiscalQuarter: seasonNum,
      dataType,
      subsidiaryCompanyId,
      ...periodTypeGroup('Q'),
      value: bvps,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, slots: withFormulaVersion({ q }, BVPS_FORMULA_VERSION) };
};
