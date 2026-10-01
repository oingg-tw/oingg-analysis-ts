import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveTrailingCashFlowStatements, trailingPeriodLabel } from '@/application/metrics/shared/trailingYear';
import { calculateFcf } from '@/application/metrics/quality/cashFlowPerShare/fcf';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——dividendCoverageRatio(TTM) = TTM 自由現金流(FCF=OCF+
// 資本支出) / TTM 股利發放現金加總（取絕對值）。跟 computeDividendCoverageRatioPit.ts
// 一致，衡量配息是不是真的用自由現金流撐得住。固定回傳 TTM。

export const getDividendCoverageRatioProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['cashFlowStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'dividendCoverageRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  // 2026-10-01 近一年改走共用來源，跟 compute 同一份資料（興櫃半年頻，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingCashFlowStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);

  const ocfs = ttmRecords.map((r) => r?.netCashFromOperatingActivities ?? null);
  const capexes = ttmRecords.map((r) => r?.capitalExpenditures ?? null);
  const dividends = ttmRecords.map((r) => r?.dividendsPaid ?? null);

  let ocfSum = 0n;
  let capexSum = 0n;
  let dividendsSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (ocfs[i] === null || capexes[i] === null) {
      complete = false;
    } else {
      ocfSum += ocfs[i]!;
      capexSum += capexes[i]!;
      dividendsSum += dividends[i] ?? 0n;
    }
  }

  const fcfSum = complete ? calculateFcf(ocfSum, capexSum) : null;
  const dividendsAbs = dividendsSum < 0n ? -dividendsSum : dividendsSum;
  const value = complete && fcfSum !== null && dividendsAbs > 0n ? Math.round((Number(fcfSum) / Number(dividendsAbs)) * 100) / 100 : null;

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `近一年 營業活動現金流（${trailingPeriodLabel(tq, trailing.basis)}，用於 FCF）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'cash_flows_from_used_in_operating_activities',
        sourceDescription: null,
        value: toProvenanceEntryValue(ocfs[i]),
      },
      {
        role: `近一年 資本支出（${trailingPeriodLabel(tq, trailing.basis)}，用於 FCF，原始資料是負值）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'purchase_of_ppe_investing',
        sourceDescription: null,
        value: toProvenanceEntryValue(capexes[i]),
      },
      {
        role: `近一年 發放股利（${trailingPeriodLabel(tq, trailing.basis)}，原始資料是現金流出負值，缺漏視為 0）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: ttmRecords[i]?.dividendsPaidFieldKey ?? null,
        sourceDescription: null,
        value: toProvenanceEntryValue(dividends[i]),
      },
    ];
  });

  return {
    symbol,
    metricCode: 'dividendCoverageRatio',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: 'FCF = 營業活動現金流 + 資本支出（資本支出帶負號，相加即為扣除），不是財報原始欄位，是計算出的中繼值，見上方原始欄位。分母股利發放取絕對值。',
  };
};
