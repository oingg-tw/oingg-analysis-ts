import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { toPerShare } from '@/domainPitMetrics/shared/numericHelpers';
import { pickEquityWithFieldKey as pickEquity, pickNetIncomeWithFieldKey as pickNetIncome } from '@/domainPitMetrics/shared/pickers';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/models/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/models/incomeStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/models/capitalStock';
import { getStockPriceAsOf } from '@/models/marketCap';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——grahamNumber(TTM) = PER(TTM) × PBR，跟
// computeGrahamNumberPit.ts 一致，數學上等價於原始公式 sqrt(22.5×EPS×BVPS) vs 股價 的
// 比較（見該檔案 2026-09-10 的說明）。獨立重算 EPS/BVPS/PER/PBR，不依賴對應
// metric_code 已寫入的值。固定回傳 TTM。

export const getGrahamNumberProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'grahamNumber', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const [balanceSheet, incomeStatement] = await Promise.all([
    getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId }),
    getQuarterlyIncomeStatement({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId }),
  ]);
  const equity = pickEquity(balanceSheet);
  const reportDate = balanceSheet?.reportDate ?? incomeStatement?.reportDate ?? null;
  const shares = reportDate ? (await getPaidInSharesAsOf(symbol, reportDate))?.paidInShares ?? null : null;
  const bvps = equity.value !== null && shares !== null ? toPerShare(equity.value, shares) : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const stockPrice = mainAnchor ? await getStockPriceAsOf(symbol, mainAnchor.knowledgeDate) : null;
  const pbRatio = bvps !== null && stockPrice !== null && bvps !== 0 ? Math.round((stockPrice.closePrice / bvps) * 100) / 100 : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const netIncomes = ttmRecords.map(pickNetIncome);

  let netIncomeTtmSum = 0n;
  let complete = true;
  for (const picked of netIncomes) {
    if (picked.value === null) complete = false;
    else netIncomeTtmSum += picked.value;
  }

  const epsTtm = complete && shares !== null ? toPerShare(netIncomeTtmSum, shares) : null;
  const peRatioTtm = epsTtm !== null && stockPrice !== null && epsTtm !== 0 ? Math.round((stockPrice.closePrice / epsTtm) * 100) / 100 : null;

  const value = peRatioTtm !== null && pbRatio !== null ? Math.round(peRatioTtm * pbRatio * 100) / 100 : null;

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
    { role: '本季流通股數', fiscalYear, fiscalQuarter: seasonNum, type: 'other', statementType: null, fieldKey: null, sourceDescription: '公開發行公司股本變動申報', value: toProvenanceEntryValue(shares) },
    { role: '本季期末淨值（BVPS 分子）', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: equity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(equity.value) },
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
    metricCode: 'grahamNumber',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `grahamNumber = PER(TTM) × PBR，兩者皆是計算出的中繼值：BVPS＝${bvps ?? 'null'}、PBR＝${pbRatio ?? 'null'}、EPS(TTM)＝${epsTtm ?? 'null'}、PER(TTM)＝${peRatioTtm ?? 'null'}。`,
  };
};
