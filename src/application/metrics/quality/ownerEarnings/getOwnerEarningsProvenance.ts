import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { toPerShare } from '@/domain/metrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——ownerEarnings(TTM) = 近四季(淨利+折舊+攤銷+資本支出)
// 各分項加總×1000(千元換元) / 流通股數（本季報告日）。跟 computeOwnerEarningsPit.ts
// 一致。固定回傳 TTM（該指標同時有 Q/Q_ANN，這裡跟其餘試點慣例一致優先選 TTM）。

export const getOwnerEarningsProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'shares'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement', 'cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'ownerEarnings', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const [incomeStatement, cashFlowStatement] = await Promise.all([
    deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId }),
    deps.statements.getCashFlowStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId }),
  ]);
  const reportDate = incomeStatement?.reportDate ?? cashFlowStatement?.reportDate ?? null;
  const shares = reportDate ? (await deps.shares.getPaidInShares(symbol, reportDate))?.paidInShares ?? null : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        deps.statements.getCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );
  const netIncomes = ttmRecords.map(([r]) => pickNetIncome(r));
  const depreciations = ttmRecords.map(([, r]) => r?.depreciation ?? null);
  const amortizations = ttmRecords.map(([, r]) => r?.amortization ?? null);
  const capexes = ttmRecords.map(([, r]) => r?.capitalExpenditures ?? null);

  let ownerEarningsTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (netIncomes[i]!.value === null || depreciations[i] === null || amortizations[i] === null || capexes[i] === null) {
      complete = false;
    } else {
      ownerEarningsTtmSum += netIncomes[i]!.value! + depreciations[i]! + amortizations[i]! + capexes[i]!;
    }
  }

  const value = complete && shares !== null ? toPerShare(ownerEarningsTtmSum, shares) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季流通股數', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(shares) },
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
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
          role: `TTM 折舊（第 ${i + 1}/4 季）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'cashFlowStatement' as const,
          fieldKey: 'adj_depreciation_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(depreciations[i]),
        },
        {
          role: `TTM 攤銷（第 ${i + 1}/4 季）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'cashFlowStatement' as const,
          fieldKey: 'adj_amortisation_expense',
          sourceDescription: null,
          value: toProvenanceEntryValue(amortizations[i]),
        },
        {
          role: `TTM 資本支出（第 ${i + 1}/4 季，原始資料是負值）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'cashFlowStatement' as const,
          fieldKey: 'purchase_of_ppe_investing',
          sourceDescription: null,
          value: toProvenanceEntryValue(capexes[i]),
        },
      ];
    }),
  ];

  return { symbol, metricCode: 'ownerEarnings', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
