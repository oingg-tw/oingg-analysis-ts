import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/infrastructure/repositories/mops/cashFlowStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——capexToOcfRatio = |近四季資本支出加總| / 近四季營業活動
// 現金流加總 × 100。這支指標實際在 computeCashFlowValuationFamilyPit.ts 裡跟 evToOcf/
// evToSales/priceToOcf/debtToFcf/croic/ocfMargin/fcfConversionRate 共用一次查詢/一個
// ttmComplete 旗標，但那個旗標額外要求 revenue/netIncome 齊全（其他指標要用），這裡只依
// capexToOcfRatio 自己真正的依賴（見 capexToOcfRatioDefinition.ts 的 dependsOn：只有
// OCF/資本支出兩個欄位）重新查一次，不引入不相關的完整度限制。現查現算不持久化，
// 刻意不動家族編排檔案。固定回傳 TTM。

export const getCapexToOcfRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'capexToOcfRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  const ocfs = ttmRecords.map((record) => record?.netCashFromOperatingActivities ?? null);
  const capexes = ttmRecords.map((record) => record?.capitalExpenditures ?? null);

  let ocfTtmSum = 0n;
  let capexTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (ocfs[i] === null || capexes[i] === null) {
      complete = false;
    } else {
      ocfTtmSum += ocfs[i]!;
      capexTtmSum += capexes[i]!;
    }
  }

  const absCapexTtmSum = capexTtmSum < 0n ? -capexTtmSum : capexTtmSum;
  const value = complete ? toPercent(absCapexTtmSum, ocfTtmSum) : null;

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i) => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `TTM 營業活動現金流（第 ${i + 1}/4 季）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'cashFlowStatement' as const,
        fieldKey: 'cash_flows_from_used_in_operating_activities',
        sourceDescription: null,
        value: toProvenanceEntryValue(ocfs[i]),
      },
      {
        role: `TTM 資本支出（第 ${i + 1}/4 季，投資活動現金流出，原始資料是負值）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'cashFlowStatement' as const,
        fieldKey: 'purchase_of_ppe_investing',
        sourceDescription: null,
        value: toProvenanceEntryValue(capexes[i]),
      },
    ];
  });

  return {
    symbol,
    metricCode: 'capexToOcfRatio',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: '分子取資本支出加總後的絕對值（原始資料是投資活動現金流出，帶負號）再除以營業活動現金流，比率本身恆為正數。',
  };
};
