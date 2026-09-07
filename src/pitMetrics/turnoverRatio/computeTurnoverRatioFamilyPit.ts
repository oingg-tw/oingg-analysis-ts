import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPastNQuarters, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 這份檔案獨立重新實作 src/domainMetrics/turnoverRatio.ts 裡「還沒遷移」的欄位——
// assetTurnover 已經由 src/pitMetrics/dupont/computeDupontFamilyPit.ts 寫入，這裡不重複
// 寫。一次查詢資產負債表+損益表，拆成 8 個 metric_code：inventoryTurnover/
// receivablesTurnover/fixedAssetTurnover/payablesTurnover（各 Q/Q_ANN/TTM）、
// inventoryDays/receivablesDays/payablesDays（DIO/DSO/DPO，各 Q_ANN/TTM）、
// cashConversionCycle（CCC，Q_ANN/TTM）——跟 Dupont 家族同一種「一次查詢拆多個
// metric_code」模式，只是規模更大。
//
// 四個周轉率共用同一個 ttmComplete 旗標（只看 operatingCost/operatingRevenue 兩個欄位）
// ——完全比照舊架構 turnoverRatio.ts 的判斷，這裡沒有像 margins 那批的行為差異，因為
// 舊架構本來就只看這兩個欄位，跟這批要算的四個比率需要的欄位完全一致。

const toTurnover = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100) / 100;
};

// DIO/DSO/DPO = 365/年化或TTM周轉率。周轉率為 0 時無法換算天數，回傳 null。
const toDays = (turnover: number | null): number | null => {
  if (turnover === null || turnover === 0) return null;
  return Math.round((365 / turnover) * 100) / 100;
};

const round2 = (x: number): number => Math.round(x * 100) / 100;

const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

// 天數指標（DIO/DSO/DPO）null_reason：對應周轉率本身為 0（除以零）回報
// zero_or_negative_denominator；周轉率本身就是 null，原因照搬周轉率自己的 nullReason。
const daysNullReason = (turnover: number | null, turnoverNullReason: MetricNullReason | null): MetricNullReason => {
  if (turnover === 0) return 'zero_or_negative_denominator';
  return turnoverNullReason ?? 'missing_input';
};

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
  const inventoryTurnoverQuarterly = operatingCost !== null && inventory !== null ? toTurnover(operatingCost, inventory) : null;
  const inventoryTurnoverQNullReason: MetricNullReason | null = inventoryTurnoverQuarterly === null ? determineNullReason(operatingCost, inventory) : null;
  const receivablesTurnoverQuarterly = operatingRevenue !== null && accountsReceivable !== null ? toTurnover(operatingRevenue, accountsReceivable) : null;
  const receivablesTurnoverQNullReason: MetricNullReason | null =
    receivablesTurnoverQuarterly === null ? determineNullReason(operatingRevenue, accountsReceivable) : null;
  const fixedAssetTurnoverQuarterly = operatingRevenue !== null && propertyPlantEquipment !== null ? toTurnover(operatingRevenue, propertyPlantEquipment) : null;
  const fixedAssetTurnoverQNullReason: MetricNullReason | null =
    fixedAssetTurnoverQuarterly === null ? determineNullReason(operatingRevenue, propertyPlantEquipment) : null;
  const payablesTurnoverQuarterly = operatingCost !== null && accountsPayable !== null ? toTurnover(operatingCost, accountsPayable) : null;
  const payablesTurnoverQNullReason: MetricNullReason | null = payablesTurnoverQuarterly === null ? determineNullReason(operatingCost, accountsPayable) : null;

  // Q_ANN（沿用各自 Q 的 nullReason）
  const inventoryTurnoverQAnnValue = inventoryTurnoverQuarterly !== null ? round2(inventoryTurnoverQuarterly * 4) : null;
  const receivablesTurnoverQAnnValue = receivablesTurnoverQuarterly !== null ? round2(receivablesTurnoverQuarterly * 4) : null;
  const fixedAssetTurnoverQAnnValue = fixedAssetTurnoverQuarterly !== null ? round2(fixedAssetTurnoverQuarterly * 4) : null;
  const payablesTurnoverQAnnValue = payablesTurnoverQuarterly !== null ? round2(payablesTurnoverQuarterly * 4) : null;

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
    inventoryTurnoverQ = await writeMetricValue({ ...coordinateFor('inventoryTurnover'), basis: 'Q', value: inventoryTurnoverQuarterly, nullReason: inventoryTurnoverQNullReason, knowledgeDate, knowledgeDateIsFallback });
    inventoryTurnoverQAnn = await writeMetricValue({ ...coordinateFor('inventoryTurnover'), basis: 'Q_ANN', value: inventoryTurnoverQAnnValue, nullReason: inventoryTurnoverQNullReason, knowledgeDate, knowledgeDateIsFallback });
    receivablesTurnoverQ = await writeMetricValue({ ...coordinateFor('receivablesTurnover'), basis: 'Q', value: receivablesTurnoverQuarterly, nullReason: receivablesTurnoverQNullReason, knowledgeDate, knowledgeDateIsFallback });
    receivablesTurnoverQAnn = await writeMetricValue({ ...coordinateFor('receivablesTurnover'), basis: 'Q_ANN', value: receivablesTurnoverQAnnValue, nullReason: receivablesTurnoverQNullReason, knowledgeDate, knowledgeDateIsFallback });
    fixedAssetTurnoverQ = await writeMetricValue({ ...coordinateFor('fixedAssetTurnover'), basis: 'Q', value: fixedAssetTurnoverQuarterly, nullReason: fixedAssetTurnoverQNullReason, knowledgeDate, knowledgeDateIsFallback });
    fixedAssetTurnoverQAnn = await writeMetricValue({ ...coordinateFor('fixedAssetTurnover'), basis: 'Q_ANN', value: fixedAssetTurnoverQAnnValue, nullReason: fixedAssetTurnoverQNullReason, knowledgeDate, knowledgeDateIsFallback });
    payablesTurnoverQ = await writeMetricValue({ ...coordinateFor('payablesTurnover'), basis: 'Q', value: payablesTurnoverQuarterly, nullReason: payablesTurnoverQNullReason, knowledgeDate, knowledgeDateIsFallback });
    payablesTurnoverQAnn = await writeMetricValue({ ...coordinateFor('payablesTurnover'), basis: 'Q_ANN', value: payablesTurnoverQAnnValue, nullReason: payablesTurnoverQNullReason, knowledgeDate, knowledgeDateIsFallback });

    // DIO/DSO/DPO（Q_ANN）+ CCC（Q_ANN）
    const inventoryDaysQAnnValue = toDays(inventoryTurnoverQAnnValue);
    const receivablesDaysQAnnValue = toDays(receivablesTurnoverQAnnValue);
    const payablesDaysQAnnValue = toDays(payablesTurnoverQAnnValue);
    const inventoryDaysQAnnNullReason: MetricNullReason | null = inventoryDaysQAnnValue === null ? daysNullReason(inventoryTurnoverQAnnValue, inventoryTurnoverQNullReason) : null;
    const receivablesDaysQAnnNullReason: MetricNullReason | null =
      receivablesDaysQAnnValue === null ? daysNullReason(receivablesTurnoverQAnnValue, receivablesTurnoverQNullReason) : null;
    const payablesDaysQAnnNullReason: MetricNullReason | null = payablesDaysQAnnValue === null ? daysNullReason(payablesTurnoverQAnnValue, payablesTurnoverQNullReason) : null;

    inventoryDaysQAnn = await writeMetricValue({ ...coordinateFor('inventoryDays'), basis: 'Q_ANN', value: inventoryDaysQAnnValue, nullReason: inventoryDaysQAnnNullReason, knowledgeDate, knowledgeDateIsFallback });
    receivablesDaysQAnn = await writeMetricValue({ ...coordinateFor('receivablesDays'), basis: 'Q_ANN', value: receivablesDaysQAnnValue, nullReason: receivablesDaysQAnnNullReason, knowledgeDate, knowledgeDateIsFallback });
    payablesDaysQAnn = await writeMetricValue({ ...coordinateFor('payablesDays'), basis: 'Q_ANN', value: payablesDaysQAnnValue, nullReason: payablesDaysQAnnNullReason, knowledgeDate, knowledgeDateIsFallback });

    const cccQAnnValue =
      inventoryDaysQAnnValue !== null && receivablesDaysQAnnValue !== null && payablesDaysQAnnValue !== null
        ? round2(inventoryDaysQAnnValue + receivablesDaysQAnnValue - payablesDaysQAnnValue)
        : null;
    const cccQAnnNullReason: MetricNullReason | null = cccQAnnValue === null ? 'missing_input' : null;
    cashConversionCycleQAnn = await writeMetricValue({
      ...coordinateFor('cashConversionCycle'),
      basis: 'Q_ANN',
      value: cccQAnnValue,
      nullReason: cccQAnnNullReason,
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

  const inventoryTurnoverTtmValue = ttmComplete && inventory !== null ? toTurnover(costTtmSum, inventory) : null;
  const receivablesTurnoverTtmValue = ttmComplete && accountsReceivable !== null ? toTurnover(revenueTtmSum, accountsReceivable) : null;
  const fixedAssetTurnoverTtmValue = ttmComplete && propertyPlantEquipment !== null ? toTurnover(revenueTtmSum, propertyPlantEquipment) : null;
  const payablesTurnoverTtmValue = ttmComplete && accountsPayable !== null ? toTurnover(costTtmSum, accountsPayable) : null;

  const inventoryTurnoverTtmNullReason: MetricNullReason | null = inventoryTurnoverTtmValue !== null ? null : ttmComplete ? determineNullReason(costTtmSum, inventory) : 'insufficient_history';
  const receivablesTurnoverTtmNullReason: MetricNullReason | null =
    receivablesTurnoverTtmValue !== null ? null : ttmComplete ? determineNullReason(revenueTtmSum, accountsReceivable) : 'insufficient_history';
  const fixedAssetTurnoverTtmNullReason: MetricNullReason | null =
    fixedAssetTurnoverTtmValue !== null ? null : ttmComplete ? determineNullReason(revenueTtmSum, propertyPlantEquipment) : 'insufficient_history';
  const payablesTurnoverTtmNullReason: MetricNullReason | null =
    payablesTurnoverTtmValue !== null ? null : ttmComplete ? determineNullReason(costTtmSum, accountsPayable) : 'insufficient_history';

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
      inventoryTurnoverTtm = await writeMetricValue({ ...coordinateFor('inventoryTurnover'), basis: 'TTM', value: inventoryTurnoverTtmValue, nullReason: inventoryTurnoverTtmNullReason, knowledgeDate, knowledgeDateIsFallback });
      receivablesTurnoverTtm = await writeMetricValue({ ...coordinateFor('receivablesTurnover'), basis: 'TTM', value: receivablesTurnoverTtmValue, nullReason: receivablesTurnoverTtmNullReason, knowledgeDate, knowledgeDateIsFallback });
      fixedAssetTurnoverTtm = await writeMetricValue({ ...coordinateFor('fixedAssetTurnover'), basis: 'TTM', value: fixedAssetTurnoverTtmValue, nullReason: fixedAssetTurnoverTtmNullReason, knowledgeDate, knowledgeDateIsFallback });
      payablesTurnoverTtm = await writeMetricValue({ ...coordinateFor('payablesTurnover'), basis: 'TTM', value: payablesTurnoverTtmValue, nullReason: payablesTurnoverTtmNullReason, knowledgeDate, knowledgeDateIsFallback });

      const inventoryDaysTtmValue = toDays(inventoryTurnoverTtmValue);
      const receivablesDaysTtmValue = toDays(receivablesTurnoverTtmValue);
      const payablesDaysTtmValue = toDays(payablesTurnoverTtmValue);
      const inventoryDaysTtmNullReason: MetricNullReason | null = inventoryDaysTtmValue === null ? daysNullReason(inventoryTurnoverTtmValue, inventoryTurnoverTtmNullReason) : null;
      const receivablesDaysTtmNullReason: MetricNullReason | null =
        receivablesDaysTtmValue === null ? daysNullReason(receivablesTurnoverTtmValue, receivablesTurnoverTtmNullReason) : null;
      const payablesDaysTtmNullReason: MetricNullReason | null = payablesDaysTtmValue === null ? daysNullReason(payablesTurnoverTtmValue, payablesTurnoverTtmNullReason) : null;

      inventoryDaysTtm = await writeMetricValue({ ...coordinateFor('inventoryDays'), basis: 'TTM', value: inventoryDaysTtmValue, nullReason: inventoryDaysTtmNullReason, knowledgeDate, knowledgeDateIsFallback });
      receivablesDaysTtm = await writeMetricValue({ ...coordinateFor('receivablesDays'), basis: 'TTM', value: receivablesDaysTtmValue, nullReason: receivablesDaysTtmNullReason, knowledgeDate, knowledgeDateIsFallback });
      payablesDaysTtm = await writeMetricValue({ ...coordinateFor('payablesDays'), basis: 'TTM', value: payablesDaysTtmValue, nullReason: payablesDaysTtmNullReason, knowledgeDate, knowledgeDateIsFallback });

      const cccTtmValue =
        inventoryDaysTtmValue !== null && receivablesDaysTtmValue !== null && payablesDaysTtmValue !== null
          ? round2(inventoryDaysTtmValue + receivablesDaysTtmValue - payablesDaysTtmValue)
          : null;
      const cccTtmNullReason: MetricNullReason | null = cccTtmValue === null ? 'missing_input' : null;
      cashConversionCycleTtm = await writeMetricValue({ ...coordinateFor('cashConversionCycle'), basis: 'TTM', value: cccTtmValue, nullReason: cccTtmNullReason, knowledgeDate, knowledgeDateIsFallback });
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
