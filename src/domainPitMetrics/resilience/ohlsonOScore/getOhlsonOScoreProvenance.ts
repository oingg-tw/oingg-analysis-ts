import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/shared/sourceData/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/shared/sourceData/cashFlowStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——Ohlson O-Score 是 9 變數 Logit 模型，見
// computeOhlsonOScorePit.ts 的完整公式。這支稽核鏈只列出真正的原始欄位（本季資產負債表
// 快照 + 今年 TTM 淨利 4 季 + 去年同季 TTM 淨利 4 季 + 今年 TTM 營業現金流 4 季，共 13 筆
// statementField），9 個中繼變數(SIZE/TLTA/WCTA/CLCA/OENEG/NITA/FUTL/INTWO/CHIN)在
// methodologyNote 說明算出來的值，不逐一拆成 entries（都是這 13 筆原始欄位的組合，
// 硬拆只會讓 entries 難以閱讀）。只算原始分數，不套用金融業排除。固定回傳 TTM。

const pickNetIncome = (record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null): bigint | null => {
  if (!record) return null;
  if (record.netIncomeAttributableToParent !== null) return record.netIncomeAttributableToParent;
  return record.netIncome;
};

const sumNetIncome = (records: ({ netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null)[]): bigint | null => {
  let sum = 0n;
  for (const record of records) {
    const value = pickNetIncome(record);
    if (value === null) return null;
    sum += value;
  }
  return sum;
};

const round4 = (x: number): number => Math.round(x * 10000) / 10000;

export const getOhlsonOScoreProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'ohlsonOScore', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const thisYearTtmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const priorYearAnchor = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorYearTtmQuarters = getPastNQuarters({ rocYear: Number(priorYearAnchor.year), season: priorYearAnchor.season }, 4);

  const fetchIncomeStatement = (tq: { year: string; season: Season }) =>
    getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId });
  const fetchCashFlow = (tq: { year: string; season: Season }) =>
    getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId });

  const [balanceSheet, thisYearIncomeRecords, priorYearIncomeRecords, thisYearCashFlowRecords] = await Promise.all([
    getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId }),
    Promise.all(thisYearTtmQuarters.map(fetchIncomeStatement)),
    Promise.all(priorYearTtmQuarters.map(fetchIncomeStatement)),
    Promise.all(thisYearTtmQuarters.map(fetchCashFlow)),
  ]);

  const totalAssets = balanceSheet?.totalAssets ?? null;
  const totalLiabilities = balanceSheet?.totalLiabilities ?? null;
  const currentAssets = balanceSheet?.currentAssets ?? null;
  const currentLiabilities = balanceSheet?.currentLiabilities ?? null;

  const netIncomeTtm = sumNetIncome(thisYearIncomeRecords);
  const netIncomeTtmPriorYear = sumNetIncome(priorYearIncomeRecords);

  let operatingCashFlowTtm: bigint | null = 0n;
  for (const record of thisYearCashFlowRecords) {
    if (!record || record.netCashFromOperatingActivities === null) {
      operatingCashFlowTtm = null;
      break;
    }
    operatingCashFlowTtm += record.netCashFromOperatingActivities;
  }

  const size = totalAssets !== null && totalAssets > 0n ? round4(Math.log(Number(totalAssets))) : null;
  const tlta = totalAssets !== null && totalLiabilities !== null && totalAssets !== 0n ? round4(Number(totalLiabilities) / Number(totalAssets)) : null;
  const wcta =
    totalAssets !== null && currentAssets !== null && currentLiabilities !== null && totalAssets !== 0n
      ? round4((Number(currentAssets) - Number(currentLiabilities)) / Number(totalAssets))
      : null;
  const clca = currentAssets !== null && currentLiabilities !== null && currentAssets !== 0n ? round4(Number(currentLiabilities) / Number(currentAssets)) : null;
  const oeneg = totalAssets !== null && totalLiabilities !== null ? (totalLiabilities > totalAssets ? 1 : 0) : null;
  const nita = netIncomeTtm !== null && totalAssets !== null && totalAssets !== 0n ? round4(Number(netIncomeTtm) / Number(totalAssets)) : null;
  const futl = operatingCashFlowTtm !== null && totalLiabilities !== null && totalLiabilities !== 0n ? round4(Number(operatingCashFlowTtm) / Number(totalLiabilities)) : null;
  const intwo = netIncomeTtm !== null && netIncomeTtmPriorYear !== null ? (netIncomeTtm < 0n && netIncomeTtmPriorYear < 0n ? 1 : 0) : null;
  const chin =
    netIncomeTtm !== null && netIncomeTtmPriorYear !== null && (netIncomeTtm !== 0n || netIncomeTtmPriorYear !== 0n)
      ? round4(Number(netIncomeTtm - netIncomeTtmPriorYear) / (Math.abs(Number(netIncomeTtm)) + Math.abs(Number(netIncomeTtmPriorYear))))
      : null;

  const variables = [size, tlta, wcta, clca, oeneg, nita, futl, intwo, chin];
  const value = variables.every((v) => v !== null)
    ? round4(-1.32 - 0.407 * size! + 6.03 * tlta! - 1.43 * wcta! + 0.0757 * clca! - 1.72 * oeneg! - 2.37 * nita! - 1.83 * futl! + 0.285 * intwo! - 0.521 * chin!)
    : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末總資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'assets', sourceDescription: null, value: toProvenanceEntryValue(totalAssets) },
    { role: '本季期末總負債', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'liabilities', sourceDescription: null, value: toProvenanceEntryValue(totalLiabilities) },
    { role: '本季期末流動資產', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'current_assets', sourceDescription: null, value: toProvenanceEntryValue(currentAssets) },
    {
      role: '本季期末流動負債',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'current_liabilities',
      sourceDescription: null,
      value: toProvenanceEntryValue(currentLiabilities),
    },
    ...thisYearTtmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `今年 TTM 淨利（第 ${i + 1}/4 季）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: thisYearIncomeRecords[i]?.netIncomeAttributableToParent !== null ? 'profit_loss_attributable_to_owners_of_parent' : 'profit_loss',
        sourceDescription: null,
        value: toProvenanceEntryValue(pickNetIncome(thisYearIncomeRecords[i]!)),
      })
    ),
    ...priorYearTtmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `去年同期 TTM 淨利（第 ${i + 1}/4 季，用於 INTWO/CHIN）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'incomeStatement',
        fieldKey: priorYearIncomeRecords[i]?.netIncomeAttributableToParent !== null ? 'profit_loss_attributable_to_owners_of_parent' : 'profit_loss',
        sourceDescription: null,
        value: toProvenanceEntryValue(pickNetIncome(priorYearIncomeRecords[i]!)),
      })
    ),
    ...thisYearTtmQuarters.map(
      (tq, i): ProvenanceEntry => ({
        role: `今年 TTM 營業活動現金流（第 ${i + 1}/4 季，用於 FUTL）`,
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        fiscalQuarter: Number(tq.season),
        type: 'statementField',
        statementType: 'cashFlowStatement',
        fieldKey: 'cash_flows_from_used_in_operating_activities',
        sourceDescription: null,
        value: toProvenanceEntryValue(thisYearCashFlowRecords[i]?.netCashFromOperatingActivities ?? null),
      })
    ),
  ];

  return {
    symbol,
    metricCode: 'ohlsonOScore',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote:
      'O = -1.32 -0.407×SIZE +6.03×TLTA -1.43×WCTA +0.0757×CLCA -1.72×OENEG -2.37×NITA -1.83×FUTL +0.285×INTWO -0.521×CHIN。' +
      `SIZE(ln總資產)＝${size ?? 'null'}、TLTA(總負債/總資產)＝${tlta ?? 'null'}、WCTA((流動資產-流動負債)/總資產)＝${wcta ?? 'null'}、` +
      `CLCA(流動負債/流動資產)＝${clca ?? 'null'}、OENEG(總負債>總資產記1否則0)＝${oeneg ?? 'null'}、NITA(淨利TTM/總資產)＝${nita ?? 'null'}、` +
      `FUTL(營業現金流TTM/總負債)＝${futl ?? 'null'}、INTWO(今年去年同期淨利TTM皆為負記1)＝${intwo ?? 'null'}、` +
      `CHIN((今年淨利TTM-去年同期)/(|今年|+|去年同期|))＝${chin ?? 'null'}。這 9 個中繼變數都是上方原始欄位組合出來的，本身不是財報原始欄位，未套用金融業排除（那是寫入路徑另外決定的政策，見 metric-history 的 nullReason）。`,
  };
};
