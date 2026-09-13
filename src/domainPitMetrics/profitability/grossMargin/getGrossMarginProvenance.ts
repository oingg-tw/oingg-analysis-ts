import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getLatestQuarterWithInsuranceIncomeStatement } from '@/shared/sourceData/insuranceIncomeStatementXbrlFirst';
import { getMarginInputs } from '../margins/computeMarginsFamilyPit';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——grossMargin(TTM) = 近四季毛利（或保險業替代科目
// insurance_service_result）加總 / 近四季營收加總。跟 computeMarginsFamilyPit.ts 共用
// 同一個 getMarginInputs（一般表查無 operatingRevenue 時自動退回保險業 IFRS17 替代科目，
// 金控業刻意不做同樣的事，見該檔案檔頭說明）。固定回傳 TTM。

export const getGrossMarginProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : ((await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement'])) ??
        (await getLatestQuarterWithInsuranceIncomeStatement(symbol, dataType, subsidiaryCompanyId).then((q) => (q ? { year: String(q.year), season: String(q.quarter) as Season } : null))));

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'grossMargin', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getMarginInputs({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  let revenueTtmSum = 0n;
  let grossProfitTtmSum = 0n;
  let complete = true;
  for (const record of ttmRecords) {
    if (record === null || record.revenue === null || record.grossProfitLike === null) {
      complete = false;
    } else {
      revenueTtmSum += record.revenue;
      grossProfitTtmSum += record.grossProfitLike;
    }
  }

  const value = complete ? toPercent(grossProfitTtmSum, revenueTtmSum) : null;

  const usedInsuranceFallback = ttmRecords.some((r) => r?.isInsuranceFallback);

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
    const record = ttmRecords[i];
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    const isInsurance = record?.isInsuranceFallback ?? false;
    return [
      {
        role: `TTM 營收（第 ${i + 1}/4 季${isInsurance ? '，保險業替代科目' : ''}）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: isInsurance ? 'insurance_revenue_quarter' : 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(record?.revenue ?? null),
      },
      {
        role: `TTM 毛利（第 ${i + 1}/4 季${isInsurance ? '，保險業替代科目：保險服務結果' : ''}）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: isInsurance ? 'insurance_service_result_quarter' : 'gross_profit',
        sourceDescription: null,
        value: toProvenanceEntryValue(record?.grossProfitLike ?? null),
      },
    ];
  });

  return {
    symbol,
    metricCode: 'grossMargin',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: usedInsuranceFallback
      ? '這家公司這段期間至少有一季查無一般產業科目（無銷貨成本/毛利概念），改用保險業 IFRS17 替代科目：revenue→insurance_revenue、grossProfit→insurance_service_result（保險服務結果）。'
      : null,
  };
};
