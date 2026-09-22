import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { calculateInventoryTurnover } from '@/domain/metrics/efficiency/inventoryTurnover/calculateInventoryTurnover';
import { calculateReceivablesTurnover } from '@/domain/metrics/efficiency/receivablesTurnover/calculateReceivablesTurnover';
import { calculateFixedAssetTurnover } from '@/domain/metrics/efficiency/fixedAssetTurnover/calculateFixedAssetTurnover';
import { calculatePayablesTurnover } from '@/domain/metrics/efficiency/payablesTurnover/calculatePayablesTurnover';
import { calculateInventoryDays } from '@/domain/metrics/efficiency/inventoryDays/calculateInventoryDays';
import { calculateReceivablesDays } from '@/domain/metrics/efficiency/receivablesDays/calculateReceivablesDays';
import { calculatePayablesDays } from '@/domain/metrics/efficiency/payablesDays/calculatePayablesDays';
import { calculateCashConversionCycle } from '@/domain/metrics/efficiency/cashConversionCycle/calculateCashConversionCycle';
import { calculateOperatingCycle } from '@/domain/metrics/efficiency/operatingCycle/calculateOperatingCycle';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, isComputationSkip, type ComputationBatch, type ComputationSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import type { MetricNullReason } from '@/domain/metrics/metricBasis';
import { averageOf, resolveAverageBalances } from '../../shared/averageBalances';

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

export type TurnoverRatioFamilyDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type TurnoverRatioFamilyComputationBatch = ComputationBatch<'inventoryTurnoverQ' | 'inventoryTurnoverTtm' | 'receivablesTurnoverQ' | 'receivablesTurnoverTtm' | 'fixedAssetTurnoverQ' | 'fixedAssetTurnoverTtm' | 'payablesTurnoverQ' | 'payablesTurnoverTtm' | 'inventoryDaysTtm' | 'receivablesDaysTtm' | 'payablesDaysTtm' | 'cashConversionCycleTtm' | 'operatingCycleTtm' | 'netWorkingCapitalTurnoverTtm' | 'inventoryToRevenueRatioTtm' | 'receivablesToRevenueRatioTtm'>;

// 2026-09-22 formulaVersion 2（公式稽核第 ④ 項，使用者拍板「改掉後更正確就改」）：四個週轉率（含由它們推出的三個
// 天數、CCC、營業週期）與淨營運資金週轉率的分母，從本季期末餘額改成期間平均——Q 用本季與上季期末兩點、TTM 用近四季
// 窗口 5 個季末（跟 roe/roa/assetTurnover 同一套 shared/averageBalances.ts）。教科書的週轉率定義本來就是「平均存貨／
// 平均應收」，期末值在季節性產業（零售旺季、年底衝貨）會系統性失真。inventoryToRevenueRatio／receivablesToRevenueRatio
// 是「現在的水位相對年營收」，語意本來就是期末，維持 v1。
export const TURNOVER_AVERAGE_DENOMINATOR_FORMULA_VERSION = 2;
const AVERAGE_DENOMINATOR_CODES = new Set(['inventoryTurnover', 'receivablesTurnover', 'fixedAssetTurnover', 'payablesTurnover', 'inventoryDays', 'receivablesDays', 'payablesDays', 'cashConversionCycle', 'operatingCycle', 'netWorkingCapitalTurnover']);

export const computeTurnoverRatioFamily = async (
  query: QuarterlyMetricQuery,
  deps: TurnoverRatioFamilyDeps
): Promise<TurnoverRatioFamilyComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const skipped = (action: 'skipped_no_quarter'): TurnoverRatioFamilyComputationBatch => ({
    symbol,
    rocYear: null,
    season: null,
    slots: {
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
    },
  });

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement'], deps.quarters);

  if (!resolvedQuarter) return skipped('skipped_no_quarter');

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const [balanceSheet, incomeStatement] = await Promise.all([deps.statements.getBalanceSheet(key), deps.statements.getIncomeStatement(key)]);

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

  const balances = await resolveAverageBalances({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const avg = {
    inventoryQ: averageOf(balances, (bs) => bs.inventory, 'q'),
    inventoryTtm: averageOf(balances, (bs) => bs.inventory, 'ttm'),
    receivableQ: averageOf(balances, (bs) => bs.accountsReceivable, 'q'),
    receivableTtm: averageOf(balances, (bs) => bs.accountsReceivable, 'ttm'),
    ppeQ: averageOf(balances, (bs) => bs.propertyPlantEquipment, 'q'),
    ppeTtm: averageOf(balances, (bs) => bs.propertyPlantEquipment, 'ttm'),
    payableQ: averageOf(balances, (bs) => bs.accountsPayable, 'q'),
    payableTtm: averageOf(balances, (bs) => bs.accountsPayable, 'ttm'),
    netWorkingCapitalTtm: averageOf(balances, (bs) => (bs.currentAssets !== null && bs.currentLiabilities !== null ? bs.currentAssets - bs.currentLiabilities : null), 'ttm'),
  };
  // 平均分母湊不齊（缺前期季末）但本季自己的餘額在 → insufficient_history，不是 missing_input。
  const withAverageDenominator = (calc: { value: number | null; nullReason: MetricNullReason | null }, average: bigint | null, current: bigint | null) =>
    calc.value === null && average === null && current !== null ? { value: null, nullReason: 'insufficient_history' as const } : calc;

  // Q：分母是本季與上季期末的平均。
  const inventoryTurnoverQuarterly = withAverageDenominator(calculateInventoryTurnover(operatingCost, avg.inventoryQ), avg.inventoryQ, inventory);
  const receivablesTurnoverQuarterly = withAverageDenominator(calculateReceivablesTurnover(operatingRevenue, avg.receivableQ), avg.receivableQ, accountsReceivable);
  const fixedAssetTurnoverQuarterly = withAverageDenominator(calculateFixedAssetTurnover(operatingRevenue, avg.ppeQ), avg.ppeQ, propertyPlantEquipment);
  const payablesTurnoverQuarterly = withAverageDenominator(calculatePayablesTurnover(operatingCost, avg.payableQ), avg.payableQ, accountsPayable);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const coordinateFor = (metricCode: string) => ({ symbol, metricCode, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId });

  let inventoryTurnoverQ: ComputationSlot;
  let receivablesTurnoverQ: ComputationSlot;
  let fixedAssetTurnoverQ: ComputationSlot;
  let payablesTurnoverQ: ComputationSlot;

  if (!mainAnchor) {
    inventoryTurnoverQ = { action: 'skipped_no_knowledge_date' };
    receivablesTurnoverQ = { action: 'skipped_no_knowledge_date' };
    fixedAssetTurnoverQ = { action: 'skipped_no_knowledge_date' };
    payablesTurnoverQ = { action: 'skipped_no_knowledge_date' };
  } else {
    const { knowledgeDate, isFallback: knowledgeDateIsFallback } = mainAnchor;
    inventoryTurnoverQ = computation({ ...coordinateFor('inventoryTurnover'), ...periodTypeGroup('Q'), value: inventoryTurnoverQuarterly.value, nullReason: inventoryTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    receivablesTurnoverQ = computation({ ...coordinateFor('receivablesTurnover'), ...periodTypeGroup('Q'), value: receivablesTurnoverQuarterly.value, nullReason: receivablesTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    fixedAssetTurnoverQ = computation({ ...coordinateFor('fixedAssetTurnover'), ...periodTypeGroup('Q'), value: fixedAssetTurnoverQuarterly.value, nullReason: fixedAssetTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
    payablesTurnoverQ = computation({ ...coordinateFor('payablesTurnover'), ...periodTypeGroup('Q'), value: payablesTurnoverQuarterly.value, nullReason: payablesTurnoverQuarterly.nullReason, knowledgeDate, knowledgeDateIsFallback });
  }

  // TTM：近四季（含本季）營業成本/營收各自加總，四個周轉率共用同一個 ttmComplete 旗標，
  // 分母是近四季窗口 5 個季末餘額的平均（2026-09-22 起）。
  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
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

  const insufficient = { value: null, nullReason: 'insufficient_history' as const };
  const inventoryTurnoverTtmCalc = ttmComplete ? withAverageDenominator(calculateInventoryTurnover(costTtmSum, avg.inventoryTtm), avg.inventoryTtm, inventory) : insufficient;
  const receivablesTurnoverTtmCalc = ttmComplete ? withAverageDenominator(calculateReceivablesTurnover(revenueTtmSum, avg.receivableTtm), avg.receivableTtm, accountsReceivable) : insufficient;
  const fixedAssetTurnoverTtmCalc = ttmComplete ? withAverageDenominator(calculateFixedAssetTurnover(revenueTtmSum, avg.ppeTtm), avg.ppeTtm, propertyPlantEquipment) : insufficient;
  const payablesTurnoverTtmCalc = ttmComplete ? withAverageDenominator(calculatePayablesTurnover(costTtmSum, avg.payableTtm), avg.payableTtm, accountsPayable) : insufficient;

  let inventoryTurnoverTtm: ComputationSlot, receivablesTurnoverTtm: ComputationSlot, fixedAssetTurnoverTtm: ComputationSlot, payablesTurnoverTtm: ComputationSlot;
  let inventoryDaysTtm: ComputationSlot, receivablesDaysTtm: ComputationSlot, payablesDaysTtm: ComputationSlot, cashConversionCycleTtm: ComputationSlot, operatingCycleTtm: ComputationSlot;
  let netWorkingCapitalTurnoverTtm: ComputationSlot, inventoryToRevenueRatioTtm: ComputationSlot, receivablesToRevenueRatioTtm: ComputationSlot;

  if (ttmComplete) {
    const ttmAnchor = await resolveKnowledgeDate(
      symbol,
      ttmQuarters.map((tq, i) => ({ rocYear: Number(tq.year), season: Number(tq.season), reportDate: ttmRecords[i]?.reportDate ?? null })), deps.announcements
    );
    if (!ttmAnchor) {
      inventoryTurnoverTtm = receivablesTurnoverTtm = fixedAssetTurnoverTtm = payablesTurnoverTtm = { action: 'skipped_no_knowledge_date' };
      inventoryDaysTtm = receivablesDaysTtm = payablesDaysTtm = cashConversionCycleTtm = operatingCycleTtm = { action: 'skipped_no_knowledge_date' };
      netWorkingCapitalTurnoverTtm = inventoryToRevenueRatioTtm = receivablesToRevenueRatioTtm = { action: 'skipped_no_knowledge_date' };
    } else {
      const { knowledgeDate, isFallback: knowledgeDateIsFallback } = ttmAnchor;
      inventoryTurnoverTtm = computation({ ...coordinateFor('inventoryTurnover'), ...periodTypeGroup('TTM'), value: inventoryTurnoverTtmCalc.value, nullReason: inventoryTurnoverTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      receivablesTurnoverTtm = computation({ ...coordinateFor('receivablesTurnover'), ...periodTypeGroup('TTM'), value: receivablesTurnoverTtmCalc.value, nullReason: receivablesTurnoverTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      fixedAssetTurnoverTtm = computation({ ...coordinateFor('fixedAssetTurnover'), ...periodTypeGroup('TTM'), value: fixedAssetTurnoverTtmCalc.value, nullReason: fixedAssetTurnoverTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      payablesTurnoverTtm = computation({ ...coordinateFor('payablesTurnover'), ...periodTypeGroup('TTM'), value: payablesTurnoverTtmCalc.value, nullReason: payablesTurnoverTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });

      const inventoryDaysTtmCalc = calculateInventoryDays(inventoryTurnoverTtmCalc.value, inventoryTurnoverTtmCalc.nullReason);
      const receivablesDaysTtmCalc = calculateReceivablesDays(receivablesTurnoverTtmCalc.value, receivablesTurnoverTtmCalc.nullReason);
      const payablesDaysTtmCalc = calculatePayablesDays(payablesTurnoverTtmCalc.value, payablesTurnoverTtmCalc.nullReason);

      inventoryDaysTtm = computation({ ...coordinateFor('inventoryDays'), ...periodTypeGroup('TTM'), value: inventoryDaysTtmCalc.value, nullReason: inventoryDaysTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      receivablesDaysTtm = computation({ ...coordinateFor('receivablesDays'), ...periodTypeGroup('TTM'), value: receivablesDaysTtmCalc.value, nullReason: receivablesDaysTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });
      payablesDaysTtm = computation({ ...coordinateFor('payablesDays'), ...periodTypeGroup('TTM'), value: payablesDaysTtmCalc.value, nullReason: payablesDaysTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });

      const cccTtmCalc = calculateCashConversionCycle(inventoryDaysTtmCalc.value, receivablesDaysTtmCalc.value, payablesDaysTtmCalc.value);
      cashConversionCycleTtm = computation({ ...coordinateFor('cashConversionCycle'), ...periodTypeGroup('TTM'), value: cccTtmCalc.value, nullReason: cccTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });

      const operatingCycleTtmCalc = calculateOperatingCycle(inventoryDaysTtmCalc.value, receivablesDaysTtmCalc.value);
      operatingCycleTtm = computation({ ...coordinateFor('operatingCycle'), ...periodTypeGroup('TTM'), value: operatingCycleTtmCalc.value, nullReason: operatingCycleTtmCalc.nullReason, knowledgeDate, knowledgeDateIsFallback });

      // 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——
      // netWorkingCapitalTurnover/inventoryToRevenueRatio/receivablesToRevenueRatio，
      // 只有 TTM 一種 basis，分母缺漏或本季餘額查無資料時 missing_input，分母為 0 時
      // zero_or_negative_denominator。
      // 分母改 5 個季末淨營運資金的平均（v2）——期末 NWC 在 Q2 會被股東會決議後的應付股利壓低。
      const netWorkingCapitalTurnoverValue = avg.netWorkingCapitalTtm !== null ? toRatio(revenueTtmSum, avg.netWorkingCapitalTtm) : null;
      netWorkingCapitalTurnoverTtm = computation({
        ...coordinateFor('netWorkingCapitalTurnover'),
        ...periodTypeGroup('TTM'),
        value: netWorkingCapitalTurnoverValue,
        nullReason: netWorkingCapitalTurnoverValue !== null ? null : netWorkingCapital === null ? 'missing_input' : avg.netWorkingCapitalTtm === null ? 'insufficient_history' : 'zero_or_negative_denominator',
        knowledgeDate,
        knowledgeDateIsFallback,
      });

      const inventoryToRevenueRatioValue = inventory !== null ? toPercent(inventory, revenueTtmSum) : null;
      inventoryToRevenueRatioTtm = computation({
        ...coordinateFor('inventoryToRevenueRatio'),
        ...periodTypeGroup('TTM'),
        value: inventoryToRevenueRatioValue,
        nullReason: inventoryToRevenueRatioValue !== null ? null : inventory === null ? 'missing_input' : 'zero_or_negative_denominator',
        knowledgeDate,
        knowledgeDateIsFallback,
      });

      const receivablesToRevenueRatioValue = accountsReceivable !== null ? toPercent(accountsReceivable, revenueTtmSum) : null;
      receivablesToRevenueRatioTtm = computation({
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
    inventoryTurnoverTtm = computation({ ...coordinateFor('inventoryTurnover'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    receivablesTurnoverTtm = computation({ ...coordinateFor('receivablesTurnover'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    fixedAssetTurnoverTtm = computation({ ...coordinateFor('fixedAssetTurnover'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    payablesTurnoverTtm = computation({ ...coordinateFor('payablesTurnover'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    inventoryDaysTtm = computation({ ...coordinateFor('inventoryDays'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    receivablesDaysTtm = computation({ ...coordinateFor('receivablesDays'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    payablesDaysTtm = computation({ ...coordinateFor('payablesDays'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    cashConversionCycleTtm = computation({ ...coordinateFor('cashConversionCycle'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    operatingCycleTtm = computation({ ...coordinateFor('operatingCycle'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    netWorkingCapitalTurnoverTtm = computation({ ...coordinateFor('netWorkingCapitalTurnover'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    inventoryToRevenueRatioTtm = computation({ ...coordinateFor('inventoryToRevenueRatio'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
    receivablesToRevenueRatioTtm = computation({ ...coordinateFor('receivablesToRevenueRatio'), ...periodTypeGroup('TTM'), value: null, nullReason: 'insufficient_history', knowledgeDate, knowledgeDateIsFallback });
  } else {
    inventoryTurnoverTtm = receivablesTurnoverTtm = fixedAssetTurnoverTtm = payablesTurnoverTtm = { action: 'skipped_no_knowledge_date' };
    inventoryDaysTtm = receivablesDaysTtm = payablesDaysTtm = cashConversionCycleTtm = operatingCycleTtm = { action: 'skipped_no_knowledge_date' };
    netWorkingCapitalTurnoverTtm = inventoryToRevenueRatioTtm = receivablesToRevenueRatioTtm = { action: 'skipped_no_knowledge_date' };
  }

  const slots = { inventoryTurnoverQ, inventoryTurnoverTtm, receivablesTurnoverQ, receivablesTurnoverTtm, fixedAssetTurnoverQ, fixedAssetTurnoverTtm, payablesTurnoverQ, payablesTurnoverTtm, inventoryDaysTtm, receivablesDaysTtm, payablesDaysTtm, cashConversionCycleTtm, operatingCycleTtm, netWorkingCapitalTurnoverTtm, inventoryToRevenueRatioTtm, receivablesToRevenueRatioTtm };
  const versioned = Object.fromEntries(
    Object.entries(slots).map(([key, slot]) => [key, !isComputationSkip(slot) && AVERAGE_DENOMINATOR_CODES.has(slot.metricCode) ? { ...slot, formulaVersion: TURNOVER_AVERAGE_DENOMINATOR_FORMULA_VERSION } : slot])
  ) as typeof slots;
  return { symbol, rocYear: year, season, slots: versioned };
};
