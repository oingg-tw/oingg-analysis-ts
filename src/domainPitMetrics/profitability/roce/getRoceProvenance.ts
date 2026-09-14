import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/models/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/models/incomeStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——roce(TTM) = 近四季 EBIT(=稅前淨利+財務費用)加總 /
// 本季期末使用資本（總資產-流動負債，單一期末值）。跟 computeRocePit.ts 一致。固定
// 回傳 TTM。

export const getRoceProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'roce', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const totalAssets = balanceSheet?.totalAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;
  const capitalEmployed = totalAssets !== null && currentLiabilities !== null ? totalAssets - currentLiabilities : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const preTaxes = ttmRecords.map((record) => record?.profitBeforeTax ?? null);
  const financeCosts = ttmRecords.map((record) => record?.financeCosts ?? null);

  let ebitTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (preTaxes[i] === null || financeCosts[i] === null) {
      complete = false;
    } else {
      ebitTtmSum += preTaxes[i]! + financeCosts[i]!;
    }
  }

  const value = complete && capitalEmployed !== null ? toPercent(ebitTtmSum, capitalEmployed) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
    { role: '本季期末流動負債', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_liabilities', sourceDescription: null, value: toProvenanceEntryValue(currentLiabilities) },
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `TTM 稅前淨利（第 ${i + 1}/4 季，用於 EBIT）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'profit_loss_before_tax',
          sourceDescription: null,
          value: toProvenanceEntryValue(preTaxes[i]),
        },
        {
          role: `TTM 財務費用（第 ${i + 1}/4 季，用於 EBIT）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: 'finance_costs',
          sourceDescription: null,
          value: toProvenanceEntryValue(financeCosts[i]),
        },
      ];
    }),
  ];

  return {
    symbol,
    metricCode: 'roce',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: '使用資本 = 總資產-流動負債（本季期末快照，不平均不加總）。EBIT 不是財報原始欄位，是稅前淨利+財務費用相加得出的中繼值，見上方原始欄位。',
  };
};
