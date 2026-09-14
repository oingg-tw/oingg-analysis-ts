import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import { financialDataAdapter, type BalanceSheetPort, type IncomeStatementPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, QuarterlyPitOutcomeBase } from '../../pitOutcome';
import { calculateInventoryTurnover } from '@/domainPitMetrics/efficiency/inventoryTurnover/calculateInventoryTurnover';
import { calculateReceivablesTurnover } from '@/domainPitMetrics/efficiency/receivablesTurnover/calculateReceivablesTurnover';
import { calculateFixedAssetTurnover } from '@/domainPitMetrics/efficiency/fixedAssetTurnover/calculateFixedAssetTurnover';
import { calculatePayablesTurnover } from '@/domainPitMetrics/efficiency/payablesTurnover/calculatePayablesTurnover';
import { calculateInventoryDays } from '@/domainPitMetrics/efficiency/inventoryDays/calculateInventoryDays';
import { calculateReceivablesDays } from '@/domainPitMetrics/efficiency/receivablesDays/calculateReceivablesDays';
import { calculatePayablesDays } from '@/domainPitMetrics/efficiency/payablesDays/calculatePayablesDays';
import { calculateCashConversionCycle } from '@/domainPitMetrics/efficiency/cashConversionCycle/calculateCashConversionCycle';
import { calculateOperatingCycle } from '@/domainPitMetrics/efficiency/operatingCycle/calculateOperatingCycle';

// 這份檔案獨立重新實作 src/domainMetrics/turnoverRatio.ts 裡「還沒遷移」的欄位——
// assetTurnover 已經由 src/domainPitMetrics/shared/dupont/computeDupontFamilyPit.ts 寫入，這裡不重複
// 寫。一次查詢資產負債表+損益表，拆成 8 個 metric_code：inventoryTurnover/
// receivablesTurnover/fixedAssetTurnover/payablesTurnover（各 Q/TTM）、
// inventoryDays/receivablesDays/payablesDays（DIO/DSO/DPO，各 TTM）、
// cashConversionCycle（CCC，TTM）——跟 Dupont 家族同一種「一次查詢拆多個
// metric_code」模式，只是規模更大。2026-09-14 應使用者要求移除單季年化（Q_ANN）節省
// 運算，Days/CCC/operatingCycle 家族原本只有 Q_ANN/TTM 兩種 basis，移除後只剩 TTM。
//
// 四個周轉率共用同一個 ttmComplete 旗標（只看 operatingCost/operatingRevenue 兩個欄位）
// ——完全比照舊架構 turnoverRatio.ts 的判斷，這裡沒有像 margins 那批的行為差異，因為
// 舊架構本來就只看這兩個欄位，跟這批要算的四個比率需要的欄位完全一致。
//
// 2026-09-08：這個檔案本身只保留「查詢+編排+寫入」（IO 這一層）——每個 metricCode 的實際
// 計算公式已經拆進 calculations/ 底下各自的檔案，這裡只負責把查回來的原始財報數字傳給對應的
// calculateXxx() 純函式、串接輸出、決定 knowledge_date、呼叫 writeMetricValue。

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——
// netWorkingCapitalTurnover/inventoryToRevenueRatio/receivablesToRevenueRatio 三支用的
// 通用 TTM 比率 helper，都只有一種 basis（TTM）。
const toRatio = (numeratorInThousands: bigint, denominatorInThousands: bigint): number | null => {
  if (denominatorInThousands === 0n) return null;
  return Math.round((Number(numeratorInThousands) / Number(denominatorInThousands)) * 100) / 100;
};
export interface TurnoverRatioFamilyPitOutcome extends QuarterlyPitOutcomeBase {
  inventoryTurnoverQ: BasisOutcome;
  inventoryTurnoverTtm: BasisOutcome;
  receivablesTurnoverQ: BasisOutcome;
  receivablesTurnoverTtm: BasisOutcome;
  fixedAssetTurnoverQ: BasisOutcome;
  fixedAssetTurnoverTtm: BasisOutcome;
  payablesTurnoverQ: BasisOutcome;
  payablesTurnoverTtm: BasisOutcome;
  inventoryDaysTtm: BasisOutcome;
  receivablesDaysTtm: BasisOutcome;
  payablesDaysTtm: BasisOutcome;
  cashConversionCycleTtm: BasisOutcome;
  operatingCycleTtm: BasisOutcome;
  netWorkingCapitalTurnoverTtm: BasisOutcome;
  inventoryToRevenueRatioTtm: BasisOutcome;
  receivablesToRevenueRatioTtm: BasisOutcome;
}

export const computeAndWriteTurnoverRatioFamilyPit = async (
  query: QuarterlyMetricQuery,
  statements: BalanceSheetPort & IncomeStatementPort = financialDataAdapter
): Promise<TurnoverRatioFamilyPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skipped = (action: 'skipped_no_quarter'): TurnoverRatioFamilyPitOutcome => ({
    symbol,
    rocYear: null,
    season: null,
    inventoryTurnoverQ: { action },
    inventoryTurnoverTtm: { action },
    receivablesTurnoverQ: { action },
    receivablesTurnoverTtm: { action },
    fixedAssetTurnoverQ: { action },
    fixedAssetTurnoverTtm: { action },
    payablesTurnoverQ: { action },
    payablesTurnoverTtm: { action },
    inventoryDaysTtm: { action },
    receivablesDaysTtm: { action },
    payablesDaysTtm: { action },
    cashConversionCycleTtm: { action },
    operatingCycleTtm: { action },
    netWorkingCapitalTurnoverTtm: { action },
    inventoryToRevenueRatioTtm: { action },
    receivablesToRevenueRatioTtm: { action },
  });

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) return skipped('skipped_no_quarter');

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement] = await Promise.all([statements.getBalanceSheet(key), statements.getIncomeStatement(key)]);

  const inventory = balanceSheet?.inventory ?? null;
  const accountsReceivable = balanceSheet?.accountsReceivable ?? null;
  const propertyPlantEquipment = balanceSheet?.propertyPlantEquipment ?? null;
  const accountsPayable = balanceSheet?.accountsPayable ?? null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const netWorkingCapital = currentAssets !== null && currentLiabilities !== null ? currentAssets - currentLiabilities : null;
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

  let inventoryTurnoverQ: BasisOutcome;
  let receivablesTurnoverQ: BasisOutcome;
  let fixedAssetTurnoverQ: BasisOutcome;
  let payablesTurnoverQ: BasisOutcome;

  if (!mainAnchor) {
    inventoryTurnoverQ = { action: 'skipped_no_knowledge_date' };
    receivablesTurnoverQ = { action: 'skipped_no_knowledge_date' };
    fixedAssetTurnoverQ = { action: 'skipped_no_knowledge_date' };
    payablesTurnoverQ = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    inventoryTurnoverQ = await writeMetricValue({ ...coordinateFor('inventoryTurnover'), ...periodTypeGroup('Q'), value: inventoryTurnoverQuarterly.value, nullReason: inventoryTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    receivablesTurnoverQ = await writeMetricValue({ ...coordinateFor('receivablesTurnover'), ...periodTypeGroup('Q'), value: receivablesTurnoverQuarterly.value, nullReason: receivablesTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    fixedAssetTurnoverQ = await writeMetricValue({ ...coordinateFor('fixedAssetTurnover'), ...periodTypeGroup('Q'), value: fixedAssetTurnoverQuarterly.value, nullReason: fixedAssetTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    payablesTurnoverQ = await writeMetricValue({ ...coordinateFor('payablesTurnover'), ...periodTypeGroup('Q'), value: payablesTurnoverQuarterly.value, nullReason: payablesTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
  }

  // TTM：近四季（含本季）營業成本/營收各自加總，四個周轉率共用同一個 ttmComplete 旗標，
  // 分母固定用本季期末餘額（不平均不加總，跟舊架構一致）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
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

  const inventoryTurnoverTtmCalc = ttmComplete ? calculateInventoryTurnover(costTtmSum, inventory) : { value: null, nullReason: 'insufficient_history' as const };
  const receivablesTurnoverTtmCalc = ttmComplete ? calculateReceivablesTurnover(revenueTtmSum, accountsReceivable) : { value: null, nullReason: 'insufficient_history' as const };
  const fixedAssetTurnoverTtmCalc = ttmComplete ? calculateFixedAssetTurnover(revenueTtmSum, propertyPlantEquipment) : { value: null, nullReason: 'insufficient_history' as const };
  const payablesTurnoverTtmCalc = ttmComplete ? calculatePayablesTurnover(costTtmSum, accountsPayable) : { value: null, nullReason: 'insufficient_history' as const };

  let inventoryTurnoverTtm: BasisOutcome, receivablesTurnoverTtm: BasisOutcome, fixedAssetTurnoverTtm: BasisOutcome, payablesTurnoverTtm: BasisOutcome;
  let inventoryDaysTtm: BasisOutcome, receivablesDaysTtm: BasisOutcome, payablesDaysTtm: BasisOutcome, cashConversionCycleTtm: BasisOutcome, operatingCycleTtm: BasisOutcome;
  let netWorkingCapitalTurnoverTtm: BasisOutcome, inventoryToRevenueRatioTtm: BasisOutcome, receivablesToRevenueRatioTtm: BasisOutcome;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null }))
    );
    if (!ttmAnchor) {
      inventoryTurnoverTtm = receivablesTurnoverTtm = fixedAssetTurnoverTtm = payablesTurnoverTtm = { action: 'skipped_no_knowledge_date' };
      inventoryDaysTtm = receivablesDaysTtm = payablesDaysTtm = cashConversionCycleTtm = operatingCycleTtm = { action: 'skipped_no_knowledge_date' };
      netWorkingCapitalTurnoverTtm = inventoryToRevenueRatioTtm = receivablesToRevenueRatioTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;
      inventoryTurnoverTtm = await writeMetricValue({ ...coordinateFor('inventoryTurnover'), ...periodTypeGroup('TTM'), value: inventoryTurnoverTtmCalc.value, nullReason: inventoryTurnoverTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      receivablesTurnoverTtm = await writeMetricValue({ ...coordinateFor('receivablesTurnover'), ...periodTypeGroup('TTM'), value: receivablesTurnoverTtmCalc.value, nullReason: receivablesTurnoverTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      fixedAssetTurnoverTtm = await writeMetricValue({ ...coordinateFor('fixedAssetTurnover'), ...periodTypeGroup('TTM'), value: fixedAssetTurnoverTtmCalc.value, nullReason: fixedAssetTurnoverTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      payablesTurnoverTtm = await writeMetricValue({ ...coordinateFor('payablesTurnover'), ...periodTypeGroup('TTM'), value: payablesTurnoverTtmCalc.value, nullReason: payablesTurnoverTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });

      const inventoryDaysTtmCalc = calculateInventoryDays(inventoryTurnoverTtmCalc.value, inventoryTurnoverTtmCalc.nullReason);
      const receivablesDaysTtmCalc = calculateReceivablesDays(receivablesTurnoverTtmCalc.value, receivablesTurnoverTtmCalc.nullReason);
      const payablesDaysTtmCalc = calculatePayablesDays(payablesTurnoverTtmCalc.value, payablesTurnoverTtmCalc.nullReason);

      inventoryDaysTtm = await writeMetricValue({ ...coordinateFor('inventoryDays'), ...periodTypeGroup('TTM'), value: inventoryDaysTtmCalc.value, nullReason: inventoryDaysTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      receivablesDaysTtm = await writeMetricValue({ ...coordinateFor('receivablesDays'), ...periodTypeGroup('TTM'), value: receivablesDaysTtmCalc.value, nullReason: receivablesDaysTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      payablesDaysTtm = await writeMetricValue({ ...coordinateFor('payablesDays'), ...periodTypeGroup('TTM'), value: payablesDaysTtmCalc.value, nullReason: payablesDaysTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });

      const cccTtmCalc = calculateCashConversionCycle(inventoryDaysTtmCalc.value, receivablesDaysTtmCalc.value, payablesDaysTtmCalc.value);
      cashConversionCycleTtm = await writeMetricValue({ ...coordinateFor('cashConversionCycle'), ...periodTypeGroup('TTM'), value: cccTtmCalc.value, nullReason: cccTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });

      const operatingCycleTtmCalc = calculateOperatingCycle(inventoryDaysTtmCalc.value, receivablesDaysTtmCalc.value);
      operatingCycleTtm = await writeMetricValue({ ...coordinateFor('operatingCycle'), ...periodTypeGroup('TTM'), value: operatingCycleTtmCalc.value, nullReason: operatingCycleTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });

      // 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——
      // netWorkingCapitalTurnover/inventoryToRevenueRatio/receivablesToRevenueRatio，
      // 只有 TTM 一種 basis，分母缺漏或本季餘額查無資料時 missing_input，分母為 0 時
      // zero_or_negative_denominator。
      const netWorkingCapitalTurnoverValue = netWorkingCapital !== null ? toRatio(revenueTtmSum, netWorkingCapital) : null;
      netWorkingCapitalTurnoverTtm = await writeMetricValue({
        ...coordinateFor('netWorkingCapitalTurnover'),
        ...periodTypeGroup('TTM'),
        value: netWorkingCapitalTurnoverValue,
        nullReason: netWorkingCapitalTurnoverValue !== null ? null : netWorkingCapital === null ? 'missing_input' : 'zero_or_negative_denominator',
        knowledgeDate,
        knowledgeDateIsFallback,
      });

      const inventoryToRevenueRatioValue = inventory !== null ? toPercent(inventory, revenueTtmSum) : null;
      inventoryToRevenueRatioTtm = await writeMetricValue({
        ...coordinateFor('inventoryToRevenueRatio'),
        ...periodTypeGroup('TTM'),
        value: inventoryToRevenueRatioValue,
        nullReason: inventoryToRevenueRatioValue !== null ? null : inventory === null ? 'missing_input' : 'zero_or_negative_denominator',
        knowledgeDate,
        knowledgeDateIsFallback,
      });

      const receivablesToRevenueRatioValue = accountsReceivable !== null ? toPercent(accountsReceivable, revenueTtmSum) : null;
      receivablesToRevenueRatioTtm = await writeMetricValue({
        ...coordinateFor('receivablesToRevenueRatio'),
        ...periodTypeGroup('TTM'),
        value: receivablesToRevenueRatioValue,
        nullReason: receivablesToRevenueRatioValue !== null ? null : accountsReceivable === null ? 'missing_input' : 'zero_or_negative_denominator',
        knowledgeDate,
        knowledgeDateIsFallback,
      });
    }
  } else if (mainAnchor) {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    inventoryTurnoverTtm = await writeMetricValue({ ...coordinateFor('inventoryTurnover'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    receivablesTurnoverTtm = await writeMetricValue({ ...coordinateFor('receivablesTurnover'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    fixedAssetTurnoverTtm = await writeMetricValue({ ...coordinateFor('fixedAssetTurnover'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    payablesTurnoverTtm = await writeMetricValue({ ...coordinateFor('payablesTurnover'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    inventoryDaysTtm = await writeMetricValue({ ...coordinateFor('inventoryDays'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    receivablesDaysTtm = await writeMetricValue({ ...coordinateFor('receivablesDays'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    payablesDaysTtm = await writeMetricValue({ ...coordinateFor('payablesDays'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    cashConversionCycleTtm = await writeMetricValue({ ...coordinateFor('cashConversionCycle'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    operatingCycleTtm = await writeMetricValue({ ...coordinateFor('operatingCycle'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    netWorkingCapitalTurnoverTtm = await writeMetricValue({ ...coordinateFor('netWorkingCapitalTurnover'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    inventoryToRevenueRatioTtm = await writeMetricValue({ ...coordinateFor('inventoryToRevenueRatio'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    receivablesToRevenueRatioTtm = await writeMetricValue({ ...coordinateFor('receivablesToRevenueRatio'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
  } else {
    inventoryTurnoverTtm = receivablesTurnoverTtm = fixedAssetTurnoverTtm = payablesTurnoverTtm = { action: 'skipped_no_knowledge_date' };
    inventoryDaysTtm = receivablesDaysTtm = payablesDaysTtm = cashConversionCycleTtm = operatingCycleTtm = { action: 'skipped_no_knowledge_date' };
    netWorkingCapitalTurnoverTtm = inventoryToRevenueRatioTtm = receivablesToRevenueRatioTtm = { action: 'skipped_no_knowledge_date' };
  }

  return {
    symbol,
    rocYear: year,
    season,
    inventoryTurnoverQ,
    inventoryTurnoverTtm,
    receivablesTurnoverQ,
    receivablesTurnoverTtm,
    fixedAssetTurnoverQ,
    fixedAssetTurnoverTtm,
    payablesTurnoverQ,
    payablesTurnoverTtm,
    inventoryDaysTtm,
    receivablesDaysTtm,
    payablesDaysTtm,
    cashConversionCycleTtm,
    operatingCycleTtm,
    netWorkingCapitalTurnoverTtm,
    inventoryToRevenueRatioTtm,
    receivablesToRevenueRatioTtm,
  };
};
