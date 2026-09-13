import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——netProfitMargin(TTM) = 近四季淨利加總 / 近四季營收
// 加總。跟 computeDupontFamilyPit.ts 一致（該檔案是 netProfitMargin 唯一的寫入路徑）。
// 固定回傳 TTM。

interface PickedField {
  value: bigint | null;
  fieldKey: string | null;
}

const pickNetIncome = (record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null): PickedField => {
  if (!record) return { value: null, fieldKey: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent, fieldKey: 'profit_loss_attributable_to_owners_of_parent' };
  if (record.netIncome !== null) return { value: record.netIncome, fieldKey: 'profit_loss' };
  return { value: null, fieldKey: null };
};

export const getNetProfitMarginProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'netProfitMargin', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const netIncomes = ttmRecords.map(pickNetIncome);
  const revenues = ttmRecords.map((record) => record?.operatingRevenue ?? null);

  let netIncomeTtmSum = 0n;
  let revenueTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (netIncomes[i]!.value === null || revenues[i] === null) {
      complete = false;
    } else {
      netIncomeTtmSum += netIncomes[i]!.value!;
      revenueTtmSum += revenues[i]!;
    }
  }

  const value = complete ? toPercent(netIncomeTtmSum, revenueTtmSum) : null;

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i) => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `TTM 淨利（第 ${i + 1}/4 季）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: netIncomes[i]!.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(netIncomes[i]!.value),
      },
      {
        role: `TTM 營收（第 ${i + 1}/4 季）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(revenues[i]),
      },
    ];
  });

  return { symbol, metricCode: 'netProfitMargin', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
