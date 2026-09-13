import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import { toRatio } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——interestCoverage(利息保障倍數) = 近四季 EBIT(=稅前淨利+
// 財務費用)加總 / 近四季財務費用加總。跟 computeInterestCoveragePit.ts 一致，
// EBIT 定義跟 dupontInterestBurden 相同公式。固定回傳 TTM。

export const getInterestCoverageProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'interestCoverage', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  const preTaxes = ttmRecords.map((record) => record?.profitBeforeTax ?? null);
  const financeCosts = ttmRecords.map((record) => record?.financeCosts ?? null);

  let ebitTtmSum = 0n;
  let financeCostsTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (preTaxes[i] === null || financeCosts[i] === null) {
      complete = false;
    } else {
      ebitTtmSum += preTaxes[i]! + financeCosts[i]!;
      financeCostsTtmSum += financeCosts[i]!;
    }
  }

  const value = complete ? toRatio(ebitTtmSum, financeCostsTtmSum) : null;

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i) => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `TTM 稅前淨利（第 ${i + 1}/4 季）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: 'profit_loss_before_tax',
        sourceDescription: null,
        value: toProvenanceEntryValue(preTaxes[i]),
      },
      {
        role: `TTM 財務費用（第 ${i + 1}/4 季，跟稅前淨利相加得出 EBIT）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: 'finance_costs',
        sourceDescription: null,
        value: toProvenanceEntryValue(financeCosts[i]),
      },
    ];
  });

  return {
    symbol,
    metricCode: 'interestCoverage',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: 'EBIT 不是財報原始欄位，是稅前淨利 + 財務費用相加得出的中繼值，見上方兩筆原始欄位；分母財務費用是同一批財務費用的加總，跟分子共用同一組原始資料。',
  };
};
