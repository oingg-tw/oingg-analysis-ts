import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { toPerShare } from '@/domainPitMetrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domainPitMetrics/shared/pickers';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/models/incomeStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/models/capitalStock';
import { getStockPriceAsOf } from '@/models/marketCap';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——earningsYield(TTM) = EPS(TTM，近四季淨利加總×1000
// (千元換元)/流通股數) / 股價(本季知識時點) * 100，是本益比倒數換算成百分比呈現。跟
// computeEarningsYieldPit.ts 一致，獨立重算 EPS 不依賴 eps/peRatio 這兩個 metric_code
// 已寫入的值。固定回傳 TTM。

export const getEarningsYieldProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'earningsYield', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const incomeStatement = await getQuarterlyIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const reportDate = incomeStatement?.reportDate ?? null;
  const shares = reportDate ? (await getPaidInSharesAsOf(symbol, reportDate))?.paidInShares ?? null : null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const stockPrice = mainAnchor ? await getStockPriceAsOf(symbol, mainAnchor.knowledgeDate) : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const netIncomes = ttmRecords.map(pickNetIncome);

  let ttmSum = 0n;
  let complete = true;
  for (const picked of netIncomes) {
    if (picked.value === null) complete = false;
    else ttmSum += picked.value;
  }

  const epsTtm = complete && shares !== null ? toPerShare(ttmSum, shares) : null;
  const value = epsTtm !== null && stockPrice !== null && stockPrice.closePrice !== 0 ? Math.round((epsTtm / stockPrice.closePrice) * 100 * 100) / 100 : null;

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
        role: `TTM 淨利（第 ${i + 1}/4 季，EPS 分子）`,
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
    metricCode: 'earningsYield',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `EPS(TTM) 不是財報原始欄位，是近四季淨利加總×1000(千元換元)/流通股數算出的中繼值。EPS(TTM)＝${epsTtm ?? 'null'}。`,
  };
};
