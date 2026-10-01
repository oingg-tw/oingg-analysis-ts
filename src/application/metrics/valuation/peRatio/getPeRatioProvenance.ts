import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPerShare } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveTrailingIncomeStatements, trailingPeriodLabel } from '../../shared/trailingYear';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——peRatio(TTM) = 股價(本季知識時點) / EPS(TTM，近四季
// 淨利加總×1000(千元換元)/流通股數)。跟 computePeRatioPit.ts 一致，獨立重算 EPS 不依賴
// eps 這個 metric_code 已寫入的值。股價用本季（不是 TTM 四季）解析出的知識時點查詢，
// 跟既有寫入路徑一致。固定回傳 TTM。

export const getPeRatioProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares' | 'market' | 'cumulativeStatements'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'peRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const incomeStatement = await deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const reportDate = incomeStatement?.reportDate ?? null;
  const shares = reportDate ? (await deps.shares.getOutstandingCommonShares(symbol, reportDate))?.outstandingCommonShares ?? null : null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const stockPrice = mainAnchor ? await deps.market.getStockPrice(symbol, mainAnchor.knowledgeDate, reportDate ?? undefined) : null;

  // 2026-10-01 近一年改走共用來源，跟 compute 同一份資料（興櫃半年頻，見 shared/trailingYear.ts）。
  const trailing = await resolveTrailingIncomeStatements({ symbol, rocYear, season: season as Season, dataType, subsidiaryCompanyId }, deps);
  const ttmQuarters = trailing.periods;
  const ttmRecords = trailing.periods.map((p) => p.record);
  const netIncomes = ttmRecords.map(pickNetIncome);

  let ttmSum = 0n;
  let complete = true;
  for (const picked of netIncomes) {
    if (picked.value === null) complete = false;
    else ttmSum += picked.value;
  }

  const epsTtm = complete && shares !== null ? toPerShare(ttmSum, shares) : null;
  const value = epsTtm !== null && stockPrice !== null && epsTtm !== 0 ? Math.round((stockPrice.closePrice / epsTtm) * 100) / 100 : null;

  const entries: ProvenanceEntry[] = [
    {
      role: '股價（本季知識時點）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: stockPrice ? `證交所／櫃買中心每日收盤價（實際交易日 ${stockPrice.tradeDate}）` : null,
      value: toProvenanceEntryValue(stockPrice?.closePrice ?? null),
    },
    { role: '本季流通股數（EPS 分母）', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(shares) },
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近一年 淨利（${trailingPeriodLabel(tq, trailing.basis)}，EPS 分子）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: netIncomes[i]!.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(netIncomes[i]!.value),
      })
    ),
  ];

  return {
    symbol,
    metricCode: 'peRatio',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `EPS(TTM) 不是財報原始欄位，是近四季淨利加總×1000(千元換元)/流通股數算出的中繼值。EPS(TTM)＝${epsTtm ?? 'null'}。`,
  };
};
