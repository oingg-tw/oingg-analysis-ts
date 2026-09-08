import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome } from '../../metricValueWriter';
import { calculateInventoryTurnover } from '@/pitMetrics/efficiency/inventoryTurnover/calculateInventoryTurnover';
import { calculateReceivablesTurnover } from '@/pitMetrics/efficiency/receivablesTurnover/calculateReceivablesTurnover';
import { calculateFixedAssetTurnover } from '@/pitMetrics/efficiency/fixedAssetTurnover/calculateFixedAssetTurnover';
import { calculatePayablesTurnover } from '@/pitMetrics/efficiency/payablesTurnover/calculatePayablesTurnover';
import { calculateInventoryDays } from '@/pitMetrics/efficiency/inventoryDays/calculateInventoryDays';
import { calculateReceivablesDays } from '@/pitMetrics/efficiency/receivablesDays/calculateReceivablesDays';
import { calculatePayablesDays } from '@/pitMetrics/efficiency/payablesDays/calculatePayablesDays';
import { calculateCashConversionCycle } from '@/pitMetrics/efficiency/cashConversionCycle/calculateCashConversionCycle';

// 這份檔案獨立重新實作 src/domainMetrics/turnoverRatio.ts 裡「還沒遷移」的欄位——
// assetTurnover 已經由 src/pitMetrics/shared/dupont/computeDupontFamilyPit.ts 寫入，這裡不重複
// 寫。一次查詢資產負債表+損益表，拆成 8 個 metric_code：inventoryTurnover/
// receivablesTurnover/fixedAssetTurnover/payablesTurnover（各 Q/Q_ANN/TTM）、
// inventoryDays/receivablesDays/payablesDays（DIO/DSO/DPO，各 Q_ANN/TTM）、
// cashConversionCycle（CCC，Q_ANN/TTM）——跟 Dupont 家族同一種「一次查詢拆多個
// metric_code」模式，只是規模更大。
//
// 四個周轉率共用同一個 ttmComplete 旗標（只看 operatingCost/operatingRevenue 兩個欄位）
// ——完全比照舊架構 turnoverRatio.ts 的判斷，這裡沒有像 margins 那批的行為差異，因為
// 舊架構本來就只看這兩個欄位，跟這批要算的四個比率需要的欄位完全一致。
//
// 2026-09-08：這個檔案本身只保留「查詢+編排+寫入」（IO 這一層）——每個 metricCode 的實際
// 計算公式已經拆進 calculations/ 底下各自的檔案，這裡只負責把查回來的原始財報數字傳給對應的
// calculateXxx() 純函式、串接輸出、決定 knowledge_date、呼叫 writeMetricValue。

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface TurnoverRatioFamilyPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  inventoryTurnoverQ: BasisOutcome;
  inventoryTurnoverQAnn: BasisOutcome;
  inventoryTurnoverTtm: BasisOutcome;
  receivablesTurnoverQ: BasisOutcome;
  receivablesTurnoverQAnn: BasisOutcome;
  receivablesTurnoverTtm: BasisOutcome;
  fixedAssetTurnoverQ: BasisOutcome;
  fixedAssetTurnoverQAnn: BasisOutcome;
  fixedAssetTurnoverTtm: BasisOutcome;
  payablesTurnoverQ: BasisOutcome;
  payablesTurnoverQAnn: BasisOutcome;
  payablesTurnoverTtm: BasisOutcome;
  inventoryDaysQAnn: BasisOutcome;
  inventoryDaysTtm: BasisOutcome;
  receivablesDaysQAnn: BasisOutcome;
  receivablesDaysTtm: BasisOutcome;
  payablesDaysQAnn: BasisOutcome;
  payablesDaysTtm: BasisOutcome;
  cashConversionCycleQAnn: BasisOutcome;
  cashConversionCycleTtm: BasisOutcome;
}

export const computeAndWriteTurnoverRatioFamilyPit = async (query: QuarterlyMetricQuery): Promise<TurnoverRatioFamilyPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skipped = (action: 'skipped_no_quarter'): TurnoverRatioFamilyPitOutcome => ({
    symbol,
    rocYear: null,
    season: null,
    inventoryTurnoverQ: { action },
    inventoryTurnoverQAnn: { action },
    inventoryTurnoverTtm: { action },
    receivablesTurnoverQ: { action },
    receivablesTurnoverQAnn: { action },
    receivablesTurnoverTtm: { action },
    fixedAssetTurnoverQ: { action },
    fixedAssetTurnoverQAnn: { action },
    fixedAssetTurnoverTtm: { action },
    payablesTurnoverQ: { action },
    payablesTurnoverQAnn: { action },
    payablesTurnoverTtm: { action },
    inventoryDaysQAnn: { action },
    inventoryDaysTtm: { action },
    receivablesDaysQAnn: { action },
    receivablesDaysTtm: { action },
    payablesDaysQAnn: { action },
    payablesDaysTtm: { action },
    cashConversionCycleQAnn: { action },
    cashConversionCycleTtm: { action },
  });

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) return skipped('skipped_no_quarter');

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement] = await Promise.all([getQuarterlyBalanceSheet(key), getQuarterlyIncomeStatement(key)]);

  const inventory = balanceSheet?.inventory ?? null;
  const accountsReceivable = balanceSheet?.accountsReceivable ?? null;
  const propertyPlantEquipment = balanceSheet?.propertyPlantEquipment ?? null;
  const accountsPayable = balanceSheet?.accountsPayable ?? null;
  const operatingCost = incomeStatement?.operatingCost ?? null;
  const operatingRevenue = incomeStatement?.operatingRevenue ?? null;
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;

  // Q
  const inventoryTurnoverQuarterly = calculateInventoryTurnover(operatingCost, inventory);
  const receivablesTurnoverQuarterly = calculateReceivablesTurnover(operatingRevenue, accountsReceivable);
  const fixedAssetTurnoverQuarterly = calculateFixedAssetTurnover(operatingRevenue, propertyPlantEquipment);
  const payablesTurnoverQuarterly = calculatePayablesTurnover(operatingCost, accountsPayable);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let inventoryTurnoverQ: BasisOutcome, inventoryTurnoverQAnn: BasisOutcome;
  let receivablesTurnoverQ: BasisOutcome, receivablesTurnoverQAnn: BasisOutcome;
  let fixedAssetTurnoverQ: BasisOutcome, fixedAssetTurnoverQAnn: BasisOutcome;
  let payablesTurnoverQ: BasisOutcome, payablesTurnoverQAnn: BasisOutcome;
  let inventoryDaysQAnn: BasisOutcome, receivablesDaysQAnn: BasisOutcome, payablesDaysQAnn: BasisOutcome, cashConversionCycleQAnn: BasisOutcome;

  if (!mainAnchor) {
    inventoryTurnoverQ = inventoryTurnoverQAnn = { action: 'skipped_no_knowledge_date' };
    receivablesTurnoverQ = receivablesTurnoverQAnn = { action: 'skipped_no_knowledge_date' };
    fixedAssetTurnoverQ = fixedAssetTurnoverQAnn = { action: 'skipped_no_knowledge_date' };
    payablesTurnoverQ = payablesTurnoverQAnn = { action: 'skipped_no_knowledge_date' };
    inventoryDaysQAnn = receivablesDaysQAnn = payablesDaysQAnn = cashConversionCycleQAnn = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    inventoryTurnoverQ = await writeMetricValue({ ...coordinateFor('inventoryTurnover'), basis: 'Q', value: inventoryTurnoverQuarterly.value, nullReason: inventoryTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    inventoryTurnoverQAnn = await writeMetricValue({ ...coordinateFor('inventoryTurnover'), basis: 'Q_ANN', value: inventoryTurnoverQuarterly.quarterlyAnnualized, nullReason: inventoryTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    receivablesTurnoverQ = await writeMetricValue({ ...coordinateFor('receivablesTurnover'), basis: 'Q', value: receivablesTurnoverQuarterly.value, nullReason: receivablesTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    receivablesTurnoverQAnn = await writeMetricValue({ ...coordinateFor('receivablesTurnover'), basis: 'Q_ANN', value: receivablesTurnoverQuarterly.quarterlyAnnualized, nullReason: receivablesTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    fixedAssetTurnoverQ = await writeMetricValue({ ...coordinateFor('fixedAssetTurnover'), basis: 'Q', value: fixedAssetTurnoverQuarterly.value, nullReason: fixedAssetTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    fixedAssetTurnoverQAnn = await writeMetricValue({ ...coordinateFor('fixedAssetTurnover'), basis: 'Q_ANN', value: fixedAssetTurnoverQuarterly.quarterlyAnnualized, nullReason: fixedAssetTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    payablesTurnoverQ = await writeMetricValue({ ...coordinateFor('payablesTurnover'), basis: 'Q', value: payablesTurnoverQuarterly.value, nullReason: payablesTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    payablesTurnoverQAnn = await writeMetricValue({ ...coordinateFor('payablesTurnover'), basis: 'Q_ANN', value: payablesTurnoverQuarterly.quarterlyAnnualized, nullReason: payablesTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });

    // DIO/DSO/DPO（Q_ANN）+ CCC（Q_ANN）
    const inventoryDaysQAnnCalc = calculateInventoryDays(inventoryTurnoverQuarterly.quarterlyAnnualized, inventoryTurnoverQuarterly.nullReason);
    const receivablesDaysQAnnCalc = calculateReceivablesDays(receivablesTurnoverQuarterly.quarterlyAnnualized, receivablesTurnoverQuarterly.nullReason);
    const payablesDaysQAnnCalc = calculatePayablesDays(payablesTurnoverQuarterly.quarterlyAnnualized, payablesTurnoverQuarterly.nullReason);

    inventoryDaysQAnn = await writeMetricValue({ ...coordinateFor('inventoryDays'), basis: 'Q_ANN', value: inventoryDaysQAnnCalc.value, nullReason: inventoryDaysQAnnCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    receivablesDaysQAnn = await writeMetricValue({ ...coordinateFor('receivablesDays'), basis: 'Q_ANN', value: receivablesDaysQAnnCalc.value, nullReason: receivablesDaysQAnnCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    payablesDaysQAnn = await writeMetricValue({ ...coordinateFor('payablesDays'), basis: 'Q_ANN', value: payablesDaysQAnnCalc.value, nullReason: payablesDaysQAnnCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });

    const cccQAnnCalc = calculateCashConversionCycle(inventoryDaysQAnnCalc.value, receivablesDaysQAnnCalc.value, payablesDaysQAnnCalc.value);
    cashConversionCycleQAnn = await writeMetricValue({
      ...coordinateFor('cashConversionCycle'),
      basis: 'Q_ANN',
      value: cccQAnnCalc.value,
      nullReason: cccQAnnCalc.nullReason,
      knowledgeDate,
      knowledgeDateIsFallback,
    });
  }

  // TTM：近四季（含本季）營業成本/營收各自加總，四個周轉率共用同一個 ttmComplete 旗標，
  // 分母固定用本季期末餘額（不平均不加總，跟舊架構一致）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let costTtmSum = 0n;
  let revenueTtmSum = 0n;
  let ttmComplete = true;
  for (const record of ttmRecords) {
    if (record === null || record.operatingCost === null || record.operatingRevenue === null) {
      ttmComplete = false;
    } else {
      costTtmSum += record.operatingCost;
      revenueTtmSum += record.operatingRevenue;
    }
  }

  const inventoryTurnoverTtmCalc = ttmComplete ? calculateInventoryTurnover(costTtmSum, inventory) : { value: null, quarterlyAnnualized: null, nullReason: 'insufficient_history' as const };
  const receivablesTurnoverTtmCalc = ttmComplete ? calculateReceivablesTurnover(revenueTtmSum, accountsReceivable) : { value: null, quarterlyAnnualized: null, nullReason: 'insufficient_history' as const };
  const fixedAssetTurnoverTtmCalc = ttmComplete ? calculateFixedAssetTurnover(revenueTtmSum, propertyPlantEquipment) : { value: null, quarterlyAnnualized: null, nullReason: 'insufficient_history' as const };
  const payablesTurnoverTtmCalc = ttmComplete ? calculatePayablesTurnover(costTtmSum, accountsPayable) : { value: null, quarterlyAnnualized: null, nullReason: 'insufficient_history' as const };

  let inventoryTurnoverTtm: BasisOutcome, receivablesTurnoverTtm: BasisOutcome, fixedAssetTurnoverTtm: BasisOutcome, payablesTurnoverTtm: BasisOutcome;
  let inventoryDaysTtm: BasisOutcome, receivablesDaysTtm: BasisOutcome, payablesDaysTtm: BasisOutcome, cashConversionCycleTtm: BasisOutcome;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      inventoryTurnoverTtm = receivablesTurnoverTtm = fixedAssetTurnoverTtm = payablesTurnoverTtm = { action: 'skipped_no_knowledge_date' };
      inventoryDaysTtm = receivablesDaysTtm = payablesDaysTtm = cashConversionCycleTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;
      inventoryTurnoverTtm = await writeMetricValue({ ...coordinateFor('inventoryTurnover'), basis: 'TTM', value: inventoryTurnoverTtmCalc.value, nullReason: inventoryTurnoverTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      receivablesTurnoverTtm = await writeMetricValue({ ...coordinateFor('receivablesTurnover'), basis: 'TTM', value: receivablesTurnoverTtmCalc.value, nullReason: receivablesTurnoverTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      fixedAssetTurnoverTtm = await writeMetricValue({ ...coordinateFor('fixedAssetTurnover'), basis: 'TTM', value: fixedAssetTurnoverTtmCalc.value, nullReason: fixedAssetTurnoverTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      payablesTurnoverTtm = await writeMetricValue({ ...coordinateFor('payablesTurnover'), basis: 'TTM', value: payablesTurnoverTtmCalc.value, nullReason: payablesTurnoverTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });

      const inventoryDaysTtmCalc = calculateInventoryDays(inventoryTurnoverTtmCalc.value, inventoryTurnoverTtmCalc.nullReason);
      const receivablesDaysTtmCalc = calculateReceivablesDays(receivablesTurnoverTtmCalc.value, receivablesTurnoverTtmCalc.nullReason);
      const payablesDaysTtmCalc = calculatePayablesDays(payablesTurnoverTtmCalc.value, payablesTurnoverTtmCalc.nullReason);

      inventoryDaysTtm = await writeMetricValue({ ...coordinateFor('inventoryDays'), basis: 'TTM', value: inventoryDaysTtmCalc.value, nullReason: inventoryDaysTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      receivablesDaysTtm = await writeMetricValue({ ...coordinateFor('receivablesDays'), basis: 'TTM', value: receivablesDaysTtmCalc.value, nullReason: receivablesDaysTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      payablesDaysTtm = await writeMetricValue({ ...coordinateFor('payablesDays'), basis: 'TTM', value: payablesDaysTtmCalc.value, nullReason: payablesDaysTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });

      const cccTtmCalc = calculateCashConversionCycle(inventoryDaysTtmCalc.value, receivablesDaysTtmCalc.value, payablesDaysTtmCalc.value);
      cashConversionCycleTtm = await writeMetricValue({ ...coordinateFor('cashConversionCycle'), basis: 'TTM', value: cccTtmCalc.value, nullReason: cccTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    inventoryTurnoverTtm = await writeMetricValue({ ...coordinateFor('inventoryTurnover'), basis: 'TTM', value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    receivablesTurnoverTtm = await writeMetricValue({ ...coordinateFor('receivablesTurnover'), basis: 'TTM', value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    fixedAssetTurnoverTtm = await writeMetricValue({ ...coordinateFor('fixedAssetTurnover'), basis: 'TTM', value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    payablesTurnoverTtm = await writeMetricValue({ ...coordinateFor('payablesTurnover'), basis: 'TTM', value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    inventoryDaysTtm = await writeMetricValue({ ...coordinateFor('inventoryDays'), basis: 'TTM', value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    receivablesDaysTtm = await writeMetricValue({ ...coordinateFor('receivablesDays'), basis: 'TTM', value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    payablesDaysTtm = await writeMetricValue({ ...coordinateFor('payablesDays'), basis: 'TTM', value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    cashConversionCycleTtm = await writeMetricValue({ ...coordinateFor('cashConversionCycle'), basis: 'TTM', value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
  } else {
    inventoryTurnoverTtm = receivablesTurnoverTtm = fixedAssetTurnoverTtm = payablesTurnoverTtm = { action: 'skipped_no_knowledge_date' };
    inventoryDaysTtm = receivablesDaysTtm = payablesDaysTtm = cashConversionCycleTtm = { action: 'skipped_no_knowledge_date' };
  }

  return {
    symbol,
    rocYear: year,
    season,
    inventoryTurnoverQ,
    inventoryTurnoverQAnn,
    inventoryTurnoverTtm,
    receivablesTurnoverQ,
    receivablesTurnoverQAnn,
    receivablesTurnoverTtm,
    fixedAssetTurnoverQ,
    fixedAssetTurnoverQAnn,
    fixedAssetTurnoverTtm,
    payablesTurnoverQ,
    payablesTurnoverQAnn,
    payablesTurnoverTtm,
    inventoryDaysQAnn,
    inventoryDaysTtm,
    receivablesDaysQAnn,
    receivablesDaysTtm,
    payablesDaysQAnn,
    payablesDaysTtm,
    cashConversionCycleQAnn,
    cashConversionCycleTtm,
  };
};
