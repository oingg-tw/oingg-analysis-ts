import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { financialDataAdapter, type CashFlowStatementPort, type PaidInSharesPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, QuarterlyPitOutcomeBase } from '../../pitOutcome';
import { calculateFcf } from './fcf';
import { calculateOcfPerShare } from '@/domainPitMetrics/quality/ocfPerShare/calculateOcfPerShare';
import { calculateFcfPerShare } from '@/domainPitMetrics/quality/fcfPerShare/calculateFcfPerShare';

// 這份檔案獨立重新實作 src/domainMetrics/cashFlowPerShare.ts，一次查詢現金流量表 + 股本歷史，
// 拆成兩個獨立 metric_code（ocfPerShare/fcfPerShare）——跟
// src/domainPitMetrics/shared/dupont/computeDupontFamilyPit.ts 同一種「一次查詢、拆多個 metric_code」模式。
//
// 2026-09-08：這個檔案本身只保留「查詢+編排+寫入」（IO 這一層）——ocfPerShare/fcfPerShare
// 的實際計算公式已經拆進 calculations/ 底下各自的檔案，這裡只負責把查回來的原始財報數字
// 傳給對應的 calculateXxx() 純函式、串接輸出、決定 knowledge_date、呼叫 writeMetricValue。

export interface CashFlowPerSharePitOutcome extends QuarterlyPitOutcomeBase {
  ocfPerShareQ: BasisOutcome;
  ocfPerShareTtm: BasisOutcome;
  fcfPerShareQ: BasisOutcome;
  fcfPerShareTtm: BasisOutcome;
}

export const computeAndWriteCashFlowPerSharePit = async (
  query: QuarterlyMetricQuery,
  statements: CashFlowStatementPort & PaidInSharesPort = financialDataAdapter
): Promise<CashFlowPerSharePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: CashFlowPerSharePitOutcome = {
    symbol,
    rocYear: null,
    season: null,
    ocfPerShareQ: { action: 'skipped_no_quarter' },
    ocfPerShareTtm: { action: 'skipped_no_quarter' },
    fcfPerShareQ: { action: 'skipped_no_quarter' },
    fcfPerShareTtm: { action: 'skipped_no_quarter' },
  };

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement']);

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const cashFlowStatement = await statements.getCashFlowStatement(key);
  const operatingCashFlow = cashFlowStatement?.netCashFromOperatingActivities ?? null;
  const capitalExpenditures = cashFlowStatement?.capitalExpenditures ?? null;
  const reportDate = cashFlowStatement?.reportDate ?? null;

  const shares = reportDate ? await statements.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const currentFcf = calculateFcf(operatingCashFlow, capitalExpenditures);

  const ocfPerShareQuarterly = calculateOcfPerShare(operatingCashFlow, sharesValue);
  const fcfPerShareQuarterly = calculateFcfPerShare(currentFcf, sharesValue);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let ocfPerShareQ: BasisOutcome;
  let fcfPerShareQ: BasisOutcome;

  if (!mainAnchor) {
    ocfPerShareQ = { action: 'skipped_no_knowledge_date' };
    fcfPerShareQ = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    ocfPerShareQ = await writeMetricValue({ ...coordinateFor('ocfPerShare'), ...periodTypeGroup('Q'), value: ocfPerShareQuarterly.value, nullReason: ocfPerShareQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    fcfPerShareQ = await writeMetricValue({ ...coordinateFor('fcfPerShare'), ...periodTypeGroup('Q'), value: fcfPerShareQuarterly.value, nullReason: fcfPerShareQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
  }

  // TTM：近四季（含本季）OCF 加總；FCF TTM = OCF 加總 + 資本支出加總。一季只要 OCF 或資本支出
  // 任一為 null 就視為該季不齊，OCF/FCF 的 TTM 共用同一組「資料齊不齊」判斷（比照 cashFlowPerShare.ts）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
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

  const ocfPerShareTtmCalc = ttmComplete ? calculateOcfPerShare(ocfTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };
  const fcfTtmSum = ttmComplete ? ocfTtmSum + capexTtmSum : null;
  const fcfPerShareTtmCalc = ttmComplete ? calculateFcfPerShare(fcfTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };

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
      ocfPerShareTtm = await writeMetricValue({ ...coordinateFor('ocfPerShare'), ...periodTypeGroup('TTM'), value: ocfPerShareTtmCalc.value, nullReason: ocfPerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      fcfPerShareTtm = await writeMetricValue({ ...coordinateFor('fcfPerShare'), ...periodTypeGroup('TTM'), value: fcfPerShareTtmCalc.value, nullReason: fcfPerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    ocfPerShareTtm = await writeMetricValue({ ...coordinateFor('ocfPerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    fcfPerShareTtm = await writeMetricValue({ ...coordinateFor('fcfPerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
  } else {
    ocfPerShareTtm = { action: 'skipped_no_knowledge_date' };
    fcfPerShareTtm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, ocfPerShareQ, ocfPerShareTtm, fcfPerShareQ, fcfPerShareTtm };
};
