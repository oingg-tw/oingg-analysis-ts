import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { calculateFcf } from './fcf';
import { calculateOcfPerShare } from '@/domain/metrics/quality/ocfPerShare/calculateOcfPerShare';
import { calculateFcfPerShare } from '@/domain/metrics/quality/fcfPerShare/calculateFcfPerShare';
import { calculateDepreciationAmortizationPerShare } from '@/domain/metrics/quality/depreciationAmortizationPerShare/calculateDepreciationAmortizationPerShare';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 這份檔案獨立重新實作 src/domainMetrics/cashFlowPerShare.ts，一次查詢現金流量表 + 股本歷史，
// 拆成多個獨立 metric_code（ocfPerShare/fcfPerShare/depreciationAmortizationPerShare）——
// 跟 src/domainPitMetrics/shared/dupont/computeDupontFamilyPit.ts 同一種「一次查詢、拆多個
// metric_code」模式。
//
// 2026-09-08：這個檔案本身只保留「查詢+編排+寫入」（IO 這一層）——ocfPerShare/fcfPerShare
// 的實際計算公式已經拆進 calculations/ 底下各自的檔案，這裡只負責把查回來的原始財報數字
// 傳給對應的 calculateXxx() 純函式、串接輸出、決定 knowledge_date、呼叫 writeMetricValue。
//
// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增 depreciationAmortizationPerShare
// ——折舊/攤銷欄位本來就在同一次現金流量表查詢裡（跟 evEbitda 算 EBITDA 用的是同一組欄位），
// 不需要額外查詢，順手一起拆成第三個 metric_code。


export type CashFlowPerShareDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type CashFlowPerShareComputationBatch = ComputationBatch<'ocfPerShareQ' | 'ocfPerShareTtm' | 'fcfPerShareQ' | 'fcfPerShareTtm' | 'depreciationAmortizationPerShareQ' | 'depreciationAmortizationPerShareTtm'>;

export const computeCashFlowPerShare = async (
  query: QuarterlyMetricQuery,
  deps: CashFlowPerShareDeps
): Promise<CashFlowPerShareComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: CashFlowPerShareComputationBatch = noQuarterBatch(symbol, ['ocfPerShareQ', 'ocfPerShareTtm', 'fcfPerShareQ', 'fcfPerShareTtm', 'depreciationAmortizationPerShareQ', 'depreciationAmortizationPerShareTtm']);

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const cashFlowStatement = await deps.statements.getCashFlowStatement(key);
  const operatingCashFlow = cashFlowStatement?.netCashFromOperatingActivities ?? null;
  const capitalExpenditures = cashFlowStatement?.capitalExpenditures ?? null;
  const depreciation = cashFlowStatement?.depreciation ?? null;
  const amortization = cashFlowStatement?.amortization ?? null;
  const depreciationAndAmortization = depreciation !== null && amortization !== null ? depreciation + amortization : null;
  const reportDate = cashFlowStatement?.reportDate ?? null;

  const shares = reportDate ? await deps.shares.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const currentFcf = calculateFcf(operatingCashFlow, capitalExpenditures);

  const ocfPerShareQuarterly = calculateOcfPerShare(operatingCashFlow, sharesValue);
  const fcfPerShareQuarterly = calculateFcfPerShare(currentFcf, sharesValue);
  const depreciationAmortizationPerShareQuarterly = calculateDepreciationAmortizationPerShare(depreciationAndAmortization, sharesValue);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let ocfPerShareQ: ComputationSlot;
  let fcfPerShareQ: ComputationSlot;
  let depreciationAmortizationPerShareQ: ComputationSlot;

  if (!mainAnchor) {
    ocfPerShareQ = { action: 'skipped_no_knowledge_date' };
    fcfPerShareQ = { action: 'skipped_no_knowledge_date' };
    depreciationAmortizationPerShareQ = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    ocfPerShareQ = computation({ ...coordinateFor('ocfPerShare'), ...periodTypeGroup('Q'), value: ocfPerShareQuarterly.value, nullReason: ocfPerShareQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    fcfPerShareQ = computation({ ...coordinateFor('fcfPerShare'), ...periodTypeGroup('Q'), value: fcfPerShareQuarterly.value, nullReason: fcfPerShareQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    depreciationAmortizationPerShareQ = computation({ ...coordinateFor('depreciationAmortizationPerShare'), ...periodTypeGroup('Q'), value: depreciationAmortizationPerShareQuarterly.value, nullReason: depreciationAmortizationPerShareQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
  }

  // TTM：近四季（含本季）OCF 加總；FCF TTM = OCF 加總 + 資本支出加總。一季只要 OCF 或資本支出
  // 任一為 null 就視為該季不齊，OCF/FCF 的 TTM 共用同一組「資料齊不齊」判斷（比照 cashFlowPerShare.ts）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let ocfTtmSum = 0n;
  let capexTtmSum = 0n;
  let daTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (
      record === null ||
      record.netCashFromOperatingActivities === null ||
      record.capitalExpenditures === null ||
      record.depreciation === null ||
      record.amortization === null
    ) {
      ttmComplete = false;
    } else {
      ocfTtmSum += record.netCashFromOperatingActivities;
      capexTtmSum += record.capitalExpenditures;
      daTtmSum += record.depreciation + record.amortization;
    }
  }

  const ocfPerShareTtmCalc = ttmComplete ? calculateOcfPerShare(ocfTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };
  const fcfTtmSum = ttmComplete ? ocfTtmSum + capexTtmSum : null;
  const fcfPerShareTtmCalc = ttmComplete ? calculateFcfPerShare(fcfTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };
  const depreciationAmortizationPerShareTtmCalc = ttmComplete
    ? calculateDepreciationAmortizationPerShare(daTtmSum, sharesValue)
    : { value: null, nullReason: 'insufficient_history' as const };

  let ocfPerShareTtm: ComputationSlot;
  let fcfPerShareTtm: ComputationSlot;
  let depreciationAmortizationPerShareTtm: ComputationSlot;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      ocfPerShareTtm = { action: 'skipped_no_knowledge_date' };
      fcfPerShareTtm = { action: 'skipped_no_knowledge_date' };
      depreciationAmortizationPerShareTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;
      ocfPerShareTtm = computation({ ...coordinateFor('ocfPerShare'), ...periodTypeGroup('TTM'), value: ocfPerShareTtmCalc.value, nullReason: ocfPerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      fcfPerShareTtm = computation({ ...coordinateFor('fcfPerShare'), ...periodTypeGroup('TTM'), value: fcfPerShareTtmCalc.value, nullReason: fcfPerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      depreciationAmortizationPerShareTtm = computation({ ...coordinateFor('depreciationAmortizationPerShare'), ...periodTypeGroup('TTM'), value: depreciationAmortizationPerShareTtmCalc.value, nullReason: depreciationAmortizationPerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    ocfPerShareTtm = computation({ ...coordinateFor('ocfPerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    fcfPerShareTtm = computation({ ...coordinateFor('fcfPerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    depreciationAmortizationPerShareTtm = computation({ ...coordinateFor('depreciationAmortizationPerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
  } else {
    ocfPerShareTtm = { action: 'skipped_no_knowledge_date' };
    fcfPerShareTtm = { action: 'skipped_no_knowledge_date' };
    depreciationAmortizationPerShareTtm = { action: 'skipped_no_knowledge_date' };
  }

  return { symbol, rocYear: year, season, slots: { ocfPerShareQ, ocfPerShareTtm, fcfPerShareQ, fcfPerShareTtm, depreciationAmortizationPerShareQ, depreciationAmortizationPerShareTtm } };
};
