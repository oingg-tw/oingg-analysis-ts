import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome } from '../../metricValueWriter';
import { calculateOcfPerShare } from './calculations/ocfPerShare';
import { calculateFcf } from './calculations/fcf';
import { calculateFcfPerShare } from './calculations/fcfPerShare';

// 這份檔案獨立重新實作 src/domainMetrics/cashFlowPerShare.ts，一次查詢現金流量表 + 股本歷史，
// 拆成兩個獨立 metric_code（ocfPerShare/fcfPerShare）——跟
// src/pitMetrics/shared/dupont/computeDupontFamilyPit.ts 同一種「一次查詢、拆多個 metric_code」模式。
//
// 2026-09-08：這個檔案本身只保留「查詢+編排+寫入」（IO 這一層）——ocfPerShare/fcfPerShare
// 的實際計算公式已經拆進 calculations/ 底下各自的檔案，這裡只負責把查回來的原始財報數字
// 傳給對應的 calculateXxx() 純函式、串接輸出、決定 knowledge_date、呼叫 writeMetricValue。

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface CashFlowPerSharePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  ocfPerShareQ: BasisOutcome;
  ocfPerShareQAnn: BasisOutcome;
  ocfPerShareTtm: BasisOutcome;
  fcfPerShareQ: BasisOutcome;
  fcfPerShareQAnn: BasisOutcome;
  fcfPerShareTtm: BasisOutcome;
}

export const computeAndWriteCashFlowPerSharePit = async (query: QuarterlyMetricQuery): Promise<CashFlowPerSharePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: CashFlowPerSharePitOutcome = {
    symbol,
    rocYear: null,
    season: null,
    ocfPerShareQ: { action: 'skipped_no_quarter' },
    ocfPerShareQAnn: { action: 'skipped_no_quarter' },
    ocfPerShareTtm: { action: 'skipped_no_quarter' },
    fcfPerShareQ: { action: 'skipped_no_quarter' },
    fcfPerShareQAnn: { action: 'skipped_no_quarter' },
    fcfPerShareTtm: { action: 'skipped_no_quarter' },
  };

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['cashFlowStatement']);

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const cashFlowStatement = await getQuarterlyCashFlowStatement(key);
  const operatingCashFlow = cashFlowStatement?.netCashFromOperatingActivities ?? null;
  const capitalExpenditures = cashFlowStatement?.capitalExpenditures ?? null;
  const reportDate = cashFlowStatement?.reportDate ?? null;

  const shares = reportDate ? await getPaidInSharesAsOf(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const currentFcf = calculateFcf(operatingCashFlow, capitalExpenditures);

  const ocfPerShareQuarterly = calculateOcfPerShare(operatingCashFlow, sharesValue);
  const fcfPerShareQuarterly = calculateFcfPerShare(currentFcf, sharesValue);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let ocfPerShareQ: BasisOutcome;
  let ocfPerShareQAnn: BasisOutcome;
  let fcfPerShareQ: BasisOutcome;
  let fcfPerShareQAnn: BasisOutcome;

  if (!mainAnchor) {
    ocfPerShareQ = { action: 'skipped_no_knowledge_date' };
    ocfPerShareQAnn = { action: 'skipped_no_knowledge_date' };
    fcfPerShareQ = { action: 'skipped_no_knowledge_date' };
    fcfPerShareQAnn = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    ocfPerShareQ = await writeMetricValue({ ...coordinateFor('ocfPerShare'), basis: 'Q', value: ocfPerShareQuarterly.value, nullReason: ocfPerShareQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    ocfPerShareQAnn = await writeMetricValue({
      ...coordinateFor('ocfPerShare'),
      basis: 'Q_ANN',
      value: ocfPerShareQuarterly.quarterlyAnnualized,
      nullReason: ocfPerShareQuarterly.nullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
    fcfPerShareQ = await writeMetricValue({ ...coordinateFor('fcfPerShare'), basis: 'Q', value: fcfPerShareQuarterly.value, nullReason: fcfPerShareQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    fcfPerShareQAnn = await writeMetricValue({
      ...coordinateFor('fcfPerShare'),
      basis: 'Q_ANN',
      value: fcfPerShareQuarterly.quarterlyAnnualized,
      nullReason: fcfPerShareQuarterly.nullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
  }

  // TTM：近四季（含本季）OCF 加總；FCF TTM = OCF 加總 + 資本支出加總。一季只要 OCF 或資本支出
  // 任一為 null 就視為該季不齊，OCF/FCF 的 TTM 共用同一組「資料齊不齊」判斷（比照 cashFlowPerShare.ts）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let ocfTtmSum = 0n;
  let capexTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.netCashFromOperatingActivities === null || record.capitalExpenditures === null) {
      ttmComplete = false;
    } else {
      ocfTtmSum += record.netCashFromOperatingActivities;
      capexTtmSum += record.capitalExpenditures;
    }
  }

  const ocfPerShareTtmCalc = ttmComplete ? calculateOcfPerShare(ocfTtmSum, sharesValue) : { value: null, quarterlyAnnualized: null, nullReason: 'insufficient_history' as const };
  const fcfTtmSum = ttmComplete ? ocfTtmSum + capexTtmSum : null;
  const fcfPerShareTtmCalc = ttmComplete ? calculateFcfPerShare(fcfTtmSum, sharesValue) : { value: null, quarterlyAnnualized: null, nullReason: 'insufficient_history' as const };

  let ocfPerShareTtm: BasisOutcome;
  let fcfPerShareTtm: BasisOutcome;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      ocfPerShareTtm = { action: 'skipped_no_knowledge_date' };
      fcfPerShareTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;
      ocfPerShareTtm = await writeMetricValue({ ...coordinateFor('ocfPerShare'), basis: 'TTM', value: ocfPerShareTtmCalc.value, nullReason: ocfPerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      fcfPerShareTtm = await writeMetricValue({ ...coordinateFor('fcfPerShare'), basis: 'TTM', value: fcfPerShareTtmCalc.value, nullReason: fcfPerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    ocfPerShareTtm = await writeMetricValue({ ...coordinateFor('ocfPerShare'), basis: 'TTM', value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    fcfPerShareTtm = await writeMetricValue({ ...coordinateFor('fcfPerShare'), basis: 'TTM', value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
  } else {
    ocfPerShareTtm = { action: 'skipped_no_knowledge_date' };
    fcfPerShareTtm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, ocfPerShareQ, ocfPerShareQAnn, ocfPerShareTtm, fcfPerShareQ, fcfPerShareQAnn, fcfPerShareTtm };
};
