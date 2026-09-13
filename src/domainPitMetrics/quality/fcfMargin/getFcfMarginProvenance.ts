import { resolveQuarterOrLatest } from '@/shared/sourceData/latestQuarter';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import { toPercent } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——fcfMargin(TTM) = 近四季自由現金流(FCF=OCF+資本
// 支出)加總 / 近四季營收加總。跟 computeFcfMarginPit.ts 一致，跟 ocfPerShare/
// fcfPerShare 同一套 FCF 定義，獨立重新計算。只有 TTM 一種 basis。

export const getFcfMarginProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'fcfMargin', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );
  const revenues = ttmRecords.map(([r]) => r?.operatingRevenue ?? null);
  const ocfs = ttmRecords.map(([, r]) => r?.netCashFromOperatingActivities ?? null);
  const capexes = ttmRecords.map(([, r]) => r?.capitalExpenditures ?? null);

  let revenueTtmSum = 0n;
  let fcfTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (revenues[i] === null || ocfs[i] === null || capexes[i] === null) {
      complete = false;
    } else {
      revenueTtmSum += revenues[i]!;
      fcfTtmSum += ocfs[i]! + capexes[i]!;
    }
  }

  const value = complete ? toPercent(fcfTtmSum, revenueTtmSum) : null;

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `TTM 營收（第 ${i + 1}/4 季）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'revenue',
        sourceDescription: null,
        value: toProvenanceEntryValue(revenues[i]),
      },
      {
        role: `TTM 營業活動現金流（第 ${i + 1}/4 季，用於 FCF）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'cash_flows_from_used_in_operating_activities',
        sourceDescription: null,
        value: toProvenanceEntryValue(ocfs[i]),
      },
      {
        role: `TTM 資本支出（第 ${i + 1}/4 季，用於 FCF，原始資料是負值）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'purchase_of_ppe_investing',
        sourceDescription: null,
        value: toProvenanceEntryValue(capexes[i]),
      },
    ];
  });

  return {
    symbol,
    metricCode: 'fcfMargin',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: 'FCF = 營業活動現金流 + 資本支出（資本支出帶負號，相加即為扣除），不是財報原始欄位，是計算出的中繼值，見上方原始欄位。',
  };
};
