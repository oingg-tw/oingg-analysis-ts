import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPerShare } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome } from '@/domain/metrics/shared/pickers';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/infrastructure/repositories/mops/incomeStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/infrastructure/repositories/mops/capitalStock';
import { getStockPriceAsOf } from '@/infrastructure/repositories/twse/marketCap';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——peRatio(TTM) = 股價(本季知識時點) / EPS(TTM，近四季
// 淨利加總×1000(千元換元)/流通股數)。跟 computePeRatioPit.ts 一致，獨立重算 EPS 不依賴
// eps 這個 metric_code 已寫入的值。股價用本季（不是 TTM 四季）解析出的知識時點查詢，
// 跟既有寫入路徑一致。固定回傳 TTM。

export const getPeRatioProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'peRatio', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
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
    metricCode: 'peRatio',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `EPS(TTM) 不是財報原始欄位，是近四季淨利加總×1000(千元換元)/流通股數算出的中繼值。EPS(TTM)＝${epsTtm ?? 'null'}。`,
  };
};
