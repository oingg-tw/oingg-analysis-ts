import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { determineNullReason, toPerShare } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 這份檔案是 src/domainMetrics/eps.ts 的獨立重新實作，刻意不 import 它的私有函式，也不呼叫
// calculateEps() 本身——保持這條新管線對舊系統唯讀，比照 computeRoaPit.ts 的既有模式。

// 三張季度財報表金額單位是「千元」，流通股數是實際股數，分子要先 x1000 換算成元。

export type EpsDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type EpsComputationBatch = ComputationBatch<'q' | 'ttm'>;

export const computeEps = async (query: QuarterlyMetricQuery, deps: EpsDeps): Promise<EpsComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['q', 'ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await deps.statements.getIncomeStatement(key);
  const netIncome = pickNetIncome(incomeStatement);
  const reportDate = incomeStatement?.reportDate ?? null;

  // 流通股數固定用「本季報告日」當下有效的股本，Q/TTM 共用同一個股數（跟 eps.ts 一致）。
  const shares = reportDate ? await deps.shares.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const epsQuarterly = netIncome.value !== null && sharesValue !== null ? toPerShare(netIncome.value, sharesValue) : null;
  const quarterlyNullReason: MetricNullReason | null = epsQuarterly === null ? determineNullReason(netIncome.value, sharesValue) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  const coordinateBase = { symbol, metricCode: 'eps', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', epsQuarterly, quarterlyNullReason);

  // TTM：近四季（含本季）淨利加總 / 流通股數。四季不齊時仍寫一列 value=null/insufficient_history，
  // knowledge_date 沿用本季（Q）自己的，跟 computeRoePit.ts 的 TTM 處理一致。
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

  const epsTtm = ttmComplete && sharesValue !== null ? toPerShare(ttmSum, sharesValue) : null;
  const ttmNullReason: MetricNullReason | null = epsTtm !== null ? null : ttmComplete ? determineNullReason(ttmSum, sharesValue) : 'insufficient_history';

  let ttm: ComputationSlot;
  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      ttm = { action: 'skipped_no_knowledge_date' };
    } else {
      ttm = computation({
        ...coordinateBase,
        ...periodTypeGroup('TTM'),
        value: epsTtm,
        nullReason: ttmNullReason,
        knowledgeDate: ttmAnchor.knowledgeDate,
        knowledgeDateIsFallback: ttmAnchor.isFallback,
      });
    }
  } else if (mainAnchor) {
    ttm = computation({
      ...coordinateBase,
      ...periodTypeGroup('TTM'),
      value: null,
      nullReason: 'insufficient_history',
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  } else {
    ttm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, slots: { q, ttm } };
};
