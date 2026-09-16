import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { toPercent } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——rdIntensity(TTM) = 近四季研發費用加總 / 近四季營收
// 加總 * 100。研發費用（research_and_development_expense）只存在 XBRL 損益表寬表，
// 舊表沒有對應欄位、沒有 fallback，跟 computeRdIntensityPit.ts 一致直接查寬表這一個
// 欄位，不走共用的 incomeStatementXbrlFirst.ts。固定回傳 TTM。

const getResearchAndDevelopmentExpense = async (key: {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
}, deps: Pick<PitDeps, 'statements' | 'quarters' | 'xbrlAccounts'>): Promise<bigint | null> => {
  return deps.xbrlAccounts.getResearchAndDevelopmentExpense(key);
};

export const getRdIntensityProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'xbrlAccounts'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'rdIntensity', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map(async (tq) => {
      const tqKey = { symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId };
      const [incomeStatement, researchExpense] = await Promise.all([deps.statements.getIncomeStatement(tqKey), getResearchAndDevelopmentExpense(tqKey, deps)]);
      return { revenue: incomeStatement?.operatingRevenue ?? null, researchExpense };
    })
  );

  let researchTtmSum = 0n;
  let revenueTtmSum = 0n;
  let complete = true;
  for (const record of ttmRecords) {
    if (record.revenue === null || record.researchExpense === null) {
      complete = false;
    } else {
      researchTtmSum += record.researchExpense;
      revenueTtmSum += record.revenue;
    }
  }

  const value = complete ? toPercent(researchTtmSum, revenueTtmSum) : null;

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `TTM 研發費用（第 ${i + 1}/4 季）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'research_and_development_expense',
        sourceDescription: null,
        value: toProvenanceEntryValue(ttmRecords[i]!.researchExpense),
      },
      {
        role: `TTM 營收（第 ${i + 1}/4 季）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(ttmRecords[i]!.revenue),
      },
    ];
  });

  return { symbol, metricCode: 'rdIntensity', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
