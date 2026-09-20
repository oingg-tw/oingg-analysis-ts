import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPerShare } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';

// 2026-09-13 使用者要求擴大稽核鏈——pegRatio(TTM) = PER(TTM) / EPS 5年複合成長率(%)。
// PER 算法複製自 peRatio，EPS CAGR 固定只取 5 年（不像 epsCagr 有 3/8 年版本，PEG 原始
// 概念本身沒有其他年期）。跟 computePegRatioPit.ts 一致，獨立重算不依賴
// peRatio/epsCagr5y 已寫入的值。成長率非正時 PEG 無意義回傳 null。固定回傳 TTM。

const PEG_GROWTH_YEARS = 5;

interface AnnualEpsQuarterDetail {
  fiscalYear: number;
  fiscalQuarter: number;
  netIncome: PickedField;
}

interface AnnualEpsResult {
  eps: number | null;
  quarters: AnnualEpsQuarterDetail[];
  shares: bigint | null;
}

const getAnnualEps = async (
  cache: Map<number, AnnualEpsResult>,
  symbol: string,
  rocYear: number,
  dataType: string,
  subsidiaryCompanyId: string, deps: Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares' | 'market'>
): Promise<AnnualEpsResult> => {
  if (cache.has(rocYear)) return cache.get(rocYear)!;

  const records = await Promise.all(
    [1, 2, 3, 4].map((quarter) => deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter, dataType, subsidiaryCompanyId }))
  );
  const netIncomes = records.map(pickNetIncome);
  const quarters: AnnualEpsQuarterDetail[] = netIncomes.map((netIncome, i) => ({ fiscalYear: rocYearToGregorian(rocYear), fiscalQuarter: i + 1, netIncome }));

  if (records.some((r) => r === null) || netIncomes.some((n) => n.value === null)) {
    const result: AnnualEpsResult = { eps: null, quarters, shares: null };
    cache.set(rocYear, result);
    return result;
  }

  const netIncomeSum = netIncomes.reduce((sum, n) => sum + n.value!, 0n);
  const q4ReportDate = records[3]!.reportDate;
  const shares = (await deps.shares.getPaidInShares(symbol, q4ReportDate))?.paidInShares ?? null;

  const eps = shares !== null && shares !== 0n ? (Number(netIncomeSum) * 1000) / Number(shares) : null;
  const result: AnnualEpsResult = { eps, quarters, shares };
  cache.set(rocYear, result);
  return result;
};

export const getPegRatioProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares' | 'market'>): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'pegRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const mainIncomeStatement = await deps.statements.getIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const reportDate = mainIncomeStatement?.reportDate ?? null;
  const shares = reportDate ? (await deps.shares.getPaidInShares(symbol, reportDate))?.paidInShares ?? null : null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);
  const stockPrice = mainAnchor ? await deps.market.getStockPrice(symbol, mainAnchor.knowledgeDate) : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const netIncomes = ttmRecords.map(pickNetIncome);

  let ttmSum = 0n;
  let ttmComplete = true;
  for (const picked of netIncomes) {
    if (picked.value === null) ttmComplete = false;
    else ttmSum += picked.value;
  }

  const epsTtm = ttmComplete && shares !== null ? toPerShare(ttmSum, shares) : null;
  const peRatioTtm = epsTtm !== null && stockPrice !== null && epsTtm !== 0 ? Math.round((stockPrice.closePrice / epsTtm) * 100) / 100 : null;

  const latestCompleteFiscalYear = seasonNum === 4 ? rocYear : rocYear - 1;
  const epsCache = new Map<number, AnnualEpsResult>();
  const currentAnnual = await getAnnualEps(epsCache, symbol, latestCompleteFiscalYear, dataType, subsidiaryCompanyId, deps);
  const priorAnnual = await getAnnualEps(epsCache, symbol, latestCompleteFiscalYear - PEG_GROWTH_YEARS, dataType, subsidiaryCompanyId, deps);

  const epsCagr5yPct =
    currentAnnual.eps !== null && priorAnnual.eps !== null && currentAnnual.eps > 0 && priorAnnual.eps > 0
      ? Math.round((Math.pow(currentAnnual.eps / priorAnnual.eps, 1 / PEG_GROWTH_YEARS) - 1) * 100 * 100) / 100
      : null;

  const value = peRatioTtm !== null && epsCagr5yPct !== null && epsCagr5yPct > 0 ? Math.round((peRatioTtm / epsCagr5yPct) * 100) / 100 : null;

  const buildYearEntries = (label: string, annual: AnnualEpsResult): ProvenanceEntry[] => [
    ...annual.quarters.map(
      (q): ProvenanceEntry => ({
        role: `${label}第 ${q.fiscalQuarter} 季淨利`,
        fiscalYear: q.fiscalYear,
        fiscalQuarter: q.fiscalQuarter,
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: q.netIncome.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(q.netIncome.value),
      })
    ),
    {
      role: `${label}Q4 報告日流通股數`,
      fiscalYear: annual.quarters[3]!.fiscalYear,
      fiscalQuarter: 4,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: '公開發行公司股本變動申報',
      value: toProvenanceEntryValue(annual.shares),
    },
  ];

  const entries: ProvenanceEntry[] = [
    {
      role: '股價（本季知識時點，用於 PER）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'other',
      statementType: null,
      fieldKey: null,
      sourceDescription: stockPrice ? `證交所／櫃買中心每日收盤價（實際交易日 ${stockPrice.tradeDate}）` : null,
      value: toProvenanceEntryValue(stockPrice?.closePrice ?? null),
    },
    { role: '本季流通股數（PER 用 EPS 分母）', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(shares) },
    ...ttmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `近四季 淨利（第 ${i + 1}/4 季，PER 用 EPS 分子）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: netIncomes[i]!.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(netIncomes[i]!.value),
      })
    ),
    ...buildYearEntries(`最近完整會計年度（民國 ${latestCompleteFiscalYear} 年，用於 5 年 EPS CAGR）`, currentAnnual),
    ...buildYearEntries(`5 年前完整會計年度（民國 ${latestCompleteFiscalYear - PEG_GROWTH_YEARS} 年，用於 5 年 EPS CAGR）`, priorAnnual),
  ];

  return {
    symbol,
    metricCode: 'pegRatio',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `PER(TTM)＝${peRatioTtm ?? 'null'}（EPS(TTM)＝${epsTtm ?? 'null'}），EPS 5年複合成長率＝${epsCagr5yPct ?? 'null'}%（最近完整會計年度 EPS＝${currentAnnual.eps ?? 'null'}，5 年前＝${priorAnnual.eps ?? 'null'}）。皆為計算出的中繼值，非財報原始欄位。`,
  };
};
