import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPerShare } from '@/domain/metrics/shared/numericHelpers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { trailingPeriodLabel, resolveTrailingIncomeStatements } from '../../shared/trailingYear';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-15 應 web-nuxt「營收到股利去了哪裡」瀑布圖卡片需求新增——跟 getEpsProvenance.ts
// 幾乎同一種形狀，差別只在分子用損益表的 profit_loss_before_tax（稅前淨利）取代淨利
// picker。固定回傳 TTM（跟其餘試點慣例一致）。

export const getPretaxIncomePerShareProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'shares' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'pretaxIncomePerShare', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const currentIncomeStatement = await deps.statements.getIncomeStatement(key);
  const reportDate = currentIncomeStatement?.reportDate ?? null;
  const shares = reportDate ? await deps.shares.getOutstandingCommonShares(symbol, reportDate) : null;
  const sharesValue = shares?.outstandingCommonShares ?? null;

  // 2026-10-01 近一年改走共用來源，跟 compute 同一份資料（興櫃半年頻，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);
  const pretaxIncomes = ttmRecords.map((r) => r?.profitBeforeTax ?? null);

  let ttmSum = 0n;
  let complete = true;
  for (const pretaxIncome of pretaxIncomes) {
    if (pretaxIncome === null) complete = false;
    else ttmSum += pretaxIncome;
  }

  const value = complete && sharesValue !== null ? toPerShare(ttmSum, sharesValue) : null;

  const entries: ProvenanceEntry[] = [
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近一年 稅前淨利（${trailingPeriodLabel(tq, trailing.basis)}）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: 'profit_loss_before_tax',
        sourceDescription: null,
        value: toProvenanceEntryValue(pretaxIncomes[i]),
      })
    ),
    { role: '流通股數（本季報告日當下有效）', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(sharesValue) },
  ];

  return { symbol, metricCode: 'pretaxIncomePerShare', found: true, fiscalYear, fiscalQuarter: seasonNum, value, entries, methodologyNote: null };
};
