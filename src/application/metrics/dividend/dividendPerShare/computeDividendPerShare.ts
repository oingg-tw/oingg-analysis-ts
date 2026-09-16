import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { calculateDividendPerShare } from '../../../../domain/metrics/dividend/dividendPerShare/calculateDividendPerShare';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——獨立查詢現金流量表
// （跟 dividendPayoutRatio.ts 同一個資料源、同一種只有 TTM 的理由），不搭在
// computeCashFlowPerSharePit.ts 那個 Q+TTM 一致的編排上——那個編排的三支指標
// （ocfPerShare/fcfPerShare/depreciationAmortizationPerShare）都是 Q/TTM 都有意義的
// 流量指標，股利發放不是，硬塞進去會讓那份共用編排多背一個「這支只寫TTM」的例外分支，
// 不如維持這裡獨立一份簡單清楚。只有 TTM 一種 basis，沒有 Q。


export type DividendPerShareDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type DividendPerShareComputationBatch = ComputationBatch<'ttm'>;

export const computeDividendPerShare = async (
  query: QuarterlyMetricQuery,
  deps: DividendPerShareDeps
): Promise<DividendPerShareComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['ttm']);
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const cashFlowStatement = await deps.statements.getCashFlowStatement(key);
  const reportDate = cashFlowStatement?.reportDate ?? null;

  const shares = reportDate ? await deps.shares.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  const coordinateBase = { symbol, metricCode: 'dividendPerShare', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  // TTM：近四季（含本季）現金股利發放加總，取絕對值（來源欄位是財務活動現金流出，
  // 存的是負值，跟 dividendPayoutRatio.ts 同一種處理）。任一季缺漏視為不齊。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let dividendsPaidTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.dividendsPaid === null) {
      ttmComplete = false;
    } else {
      dividendsPaidTtmSum += record.dividendsPaid;
    }
  }
  const dividendsPaidAbs = ttmComplete ? (dividendsPaidTtmSum < 0n ? -dividendsPaidTtmSum : dividendsPaidTtmSum) : null;

  const ttmCalc = ttmComplete ? calculateDividendPerShare(dividendsPaidAbs, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };

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
        value: ttmCalc.value,
        nullReason: ttmCalc.nullReason,
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

  return { symbol, rocYear: year, season, slots: { ttm } };
};
