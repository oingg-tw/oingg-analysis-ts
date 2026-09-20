import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——capexToRevenue = |近四季資本支出加總| / 近四季營收加總
// × 100，資本支出來源資料本身是負值（現金流出），稽核鏈原樣列出（不取絕對值），
// methodologyNote 說明取絕對值這一步。現查現算不持久化，刻意不動
// computeCapexToRevenuePit.ts。固定回傳 TTM。

export const getCapexToRevenueProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'capexToRevenue', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        deps.statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  const revenues = ttmRecords.map(([income]) => income?.operatingRevenue ?? null);
  const capexes = ttmRecords.map(([, cashFlow]) => cashFlow?.capitalExpenditures ?? null);

  let revenueTtmSum = 0n;
  let capexTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (revenues[i] === null || capexes[i] === null) {
      complete = false;
    } else {
      revenueTtmSum += revenues[i]!;
      capexTtmSum += capexes[i]!;
    }
  }

  const absCapexTtmSum = capexTtmSum < 0n ? -capexTtmSum : capexTtmSum;
  const value = complete ? toPercent(absCapexTtmSum, revenueTtmSum) : null;

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i) => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `近四季 營收（第 ${i + 1}/4 季）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(revenues[i]),
      },
      {
        role: `近四季 資本支出（第 ${i + 1}/4 季，投資活動現金流出，原始資料是負值）`,
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
    metricCode: 'capexToRevenue',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: '分子取資本支出加總後的絕對值（原始資料是投資活動現金流出，帶負號）再除以營收，比率本身恆為正數。',
  };
};
