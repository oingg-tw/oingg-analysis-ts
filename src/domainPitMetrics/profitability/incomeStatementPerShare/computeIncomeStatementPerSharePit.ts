import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { financialDataAdapter, type IncomeStatementPort, type PaidInSharesPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, QuarterlyPitOutcomeBase } from '../../pitOutcome';
import { calculateGrossProfitPerShare } from '@/domainPitMetrics/profitability/grossProfitPerShare/calculateGrossProfitPerShare';
import { calculateOperatingIncomePerShare } from '@/domainPitMetrics/profitability/operatingIncomePerShare/calculateOperatingIncomePerShare';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——一次查詢損益表，
// 拆成兩個獨立 metric_code（grossProfitPerShare/operatingIncomePerShare），跟
// computeCashFlowPerSharePit.ts/computeDupontFamilyPit.ts 同一種「一次查詢、拆多個
// metric_code」模式。兩者都是損益表原始金額科目直接除以股數，不經過 margin 比率反推
// （grossMargin×revenuePerShare 這種算法會疊加 margin 欄位本身的捨入誤差），理由見
// 兩支各自 calculateXxx.ts 的說明。跟 eps 共用同一份 IncomeStatementPort 查詢，但
// 刻意不合併進 computeEpsPit.ts——eps 的淨利需要 pickNetIncome() 處理歸屬母公司/整體
// 口徑的挑選邏輯，毛利/營業利益是損益表單一欄位直接讀，沒有這層複雜度，合併只會讓
// eps.ts 多背一個它不需要的查詢分支。

export interface IncomeStatementPerSharePitOutcome extends QuarterlyPitOutcomeBase {
  grossProfitPerShareQ: BasisOutcome;
  grossProfitPerShareTtm: BasisOutcome;
  operatingIncomePerShareQ: BasisOutcome;
  operatingIncomePerShareTtm: BasisOutcome;
}

export const computeAndWriteIncomeStatementPerSharePit = async (
  query: QuarterlyMetricQuery,
  statements: IncomeStatementPort & PaidInSharesPort = financialDataAdapter
): Promise<IncomeStatementPerSharePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skippedNoQuarter: IncomeStatementPerSharePitOutcome = {
    symbol,
    rocYear: null,
    season: null,
    grossProfitPerShareQ: { action: 'skipped_no_quarter' },
    grossProfitPerShareTtm: { action: 'skipped_no_quarter' },
    operatingIncomePerShareQ: { action: 'skipped_no_quarter' },
    operatingIncomePerShareTtm: { action: 'skipped_no_quarter' },
  };

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) return skippedNoQuarter;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await statements.getIncomeStatement(key);
  const grossProfit = incomeStatement?.grossProfit ?? null;
  const operatingIncome = incomeStatement?.operatingIncome ?? null;
  const reportDate = incomeStatement?.reportDate ?? null;

  const shares = reportDate ? await statements.getPaidInShares(symbol, reportDate) : null;
  const sharesValue = shares?.paidInShares ?? null;

  const grossProfitQuarterly = calculateGrossProfitPerShare(grossProfit, sharesValue);
  const operatingIncomeQuarterly = calculateOperatingIncomePerShare(operatingIncome, sharesValue);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let grossProfitPerShareQ: BasisOutcome;
  let operatingIncomePerShareQ: BasisOutcome;

  if (!mainAnchor) {
    grossProfitPerShareQ = { action: 'skipped_no_knowledge_date' };
    operatingIncomePerShareQ = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    grossProfitPerShareQ = await writeMetricValue({ ...coordinateFor('grossProfitPerShare'), ...periodTypeGroup('Q'), value: grossProfitQuarterly.value, nullReason: grossProfitQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    operatingIncomePerShareQ = await writeMetricValue({ ...coordinateFor('operatingIncomePerShare'), ...periodTypeGroup('Q'), value: operatingIncomeQuarterly.value, nullReason: operatingIncomeQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
  }

  // TTM：近四季（含本季）加總。一季只要毛利或營業利益任一為 null 就視為該季不齊——
  // 兩個 metric_code 共用同一組「資料齊不齊」判斷（跟 cashFlowPerShare 的 OCF/FCF 一致）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let grossProfitTtmSum = 0n;
  let operatingIncomeTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.grossProfit === null || record.operatingIncome === null) {
      ttmComplete = false;
    } else {
      grossProfitTtmSum += record.grossProfit;
      operatingIncomeTtmSum += record.operatingIncome;
    }
  }

  const grossProfitPerShareTtmCalc = ttmComplete ? calculateGrossProfitPerShare(grossProfitTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };
  const operatingIncomePerShareTtmCalc = ttmComplete ? calculateOperatingIncomePerShare(operatingIncomeTtmSum, sharesValue) : { value: null, nullReason: 'insufficient_history' as const };

  let grossProfitPerShareTtm: BasisOutcome;
  let operatingIncomePerShareTtm: BasisOutcome;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      grossProfitPerShareTtm = { action: 'skipped_no_knowledge_date' };
      operatingIncomePerShareTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;
      grossProfitPerShareTtm = await writeMetricValue({ ...coordinateFor('grossProfitPerShare'), ...periodTypeGroup('TTM'), value: grossProfitPerShareTtmCalc.value, nullReason: grossProfitPerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      operatingIncomePerShareTtm = await writeMetricValue({ ...coordinateFor('operatingIncomePerShare'), ...periodTypeGroup('TTM'), value: operatingIncomePerShareTtmCalc.value, nullReason: operatingIncomePerShareTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    grossProfitPerShareTtm = await writeMetricValue({ ...coordinateFor('grossProfitPerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    operatingIncomePerShareTtm = await writeMetricValue({ ...coordinateFor('operatingIncomePerShare'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
  } else {
    grossProfitPerShareTtm = { action: 'skipped_no_knowledge_date' };
    operatingIncomePerShareTtm = { action: 'skipped_no_knowledge_date' };
  }

  return {
    symbol,
    rocYear: year,
    season,
    grossProfitPerShareQ,
    grossProfitPerShareTtm,
    operatingIncomePerShareQ,
    operatingIncomePerShareTtm,
  };
};
