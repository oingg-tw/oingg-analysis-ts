import { getLatestAvailableQuarter } from '@/application/financials/latestQuarter';
import { getMarginInputs, type MarginsFamilyDeps } from '../margins/computeMarginsFamily';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——operatingMargin(TTM) = 近四季營業利益（或保險業替代
// 科目 net_operating_income_loss）加總 / 近四季營收加總。跟 computeMarginsFamilyPit.ts
// 共用同一個 getMarginInputs（見 getGrossMarginProvenance.ts 的相同說明）。固定回傳 TTM。

export const getOperatingMarginProvenance = async (query: QuarterlyMetricQuery, deps: MarginsFamilyDeps): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : ((await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement'], deps.quarters)) ??
        (await deps.quarters
          .latestQuarterWith('insuranceIncomeStatement', symbol, dataType, subsidiaryCompanyId)
          .then((q) => (q ? { year: String(q.year), season: String(q.quarter) as Season } : null))));

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'operatingMargin', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getMarginInputs({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }, deps))
  );

  let revenueTtmSum = 0n;
  let operatingIncomeTtmSum = 0n;
  let complete = true;
  for (const record of ttmRecords) {
    if (record === null || record.revenue === null || record.operatingIncomeLike === null) {
      complete = false;
    } else {
      revenueTtmSum += record.revenue;
      operatingIncomeTtmSum += record.operatingIncomeLike;
    }
  }

  const value = complete ? toPercent(operatingIncomeTtmSum, revenueTtmSum) : null;

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
        role: `TTM 營業利益（第 ${i + 1}/4 季${isInsurance ? '，保險業替代科目：淨營業損益' : ''}）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: isInsurance ? 'net_operating_income_loss_quarter' : 'profit_loss_from_operating_activities',
        sourceDescription: null,
        value: toProvenanceEntryValue(record?.operatingIncomeLike ?? null),
      },
    ];
  });

  return {
    symbol,
    metricCode: 'operatingMargin',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: usedInsuranceFallback
      ? '這家公司這段期間至少有一季查無一般產業科目，改用保險業 IFRS17 替代科目：revenue→insurance_revenue、operatingIncome→net_operating_income_loss（淨營業損益）。'
      : null,
  };
};
