import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/models/mops/balanceSheetXbrlFirst';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/models/mops/cashFlowStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import { toRatio } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——debtToFcf = 有息負債(本季期末快照，短期借款+應付
// 公司債+長期借款) / FCF(TTM，OCF+資本支出加總)。跟 computeCashFlowValuationFamilyPit.ts
// 的 debtToFcf 一致，但這裡只重新查這支自己真正的依賴（有息負債+OCF+資本支出），不是
// 那個 family 共用的 ttmComplete 旗標（那個旗標額外要求 revenue/netIncome 齊全，是給
// 同家族其他指標用的）。固定回傳 TTM。

export const getDebtToFcfProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'debtToFcf', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const shortTermBorrowings = balanceSheet?.shortTermBorrowings ?? null;
  const bondsPayable = balanceSheet?.bondsPayable ?? null;
  const longTermBorrowings = balanceSheet?.longTermBorrowings ?? null;
  const totalDebt = balanceSheet ? (shortTermBorrowings ?? 0n) + (bondsPayable ?? 0n) + (longTermBorrowings ?? 0n) : null;

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  const ocfs = ttmRecords.map((record) => record?.netCashFromOperatingActivities ?? null);
  const capexes = ttmRecords.map((record) => record?.capitalExpenditures ?? null);

  let fcfTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (ocfs[i] === null || capexes[i] === null) {
      complete = false;
    } else {
      fcfTtmSum += ocfs[i]! + capexes[i]!; // capex 是負數，加總即為扣除。
    }
  }

  const value = complete && totalDebt !== null ? toRatio(totalDebt, fcfTtmSum) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末短期借款', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: 'shortterm_borrowings', sourceDescription: null, value: toProvenanceEntryValue(shortTermBorrowings) },
    {
      role: '本季期末應付公司債（非流動部分）',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'noncurrent_portion_of_bonds_issued',
      sourceDescription: null,
      value: toProvenanceEntryValue(bondsPayable),
    },
    {
      role: '本季期末長期借款',
      fiscalYear,
      fiscalQuarter: seasonNum,
      type: 'statementField',
      statementType: 'balanceSheet',
      fieldKey: 'longterm_borrowings',
      sourceDescription: null,
      value: toProvenanceEntryValue(longTermBorrowings),
    },
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `TTM 營業活動現金流（第 ${i + 1}/4 季）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField',
          statementType: 'cashFlowStatement',
          fieldKey: 'cash_flows_from_used_in_operating_activities',
          sourceDescription: null,
          value: toProvenanceEntryValue(ocfs[i]),
        },
        {
          role: `TTM 資本支出（第 ${i + 1}/4 季，投資活動現金流出，原始資料是負值）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField',
          statementType: 'cashFlowStatement',
          fieldKey: 'purchase_of_ppe_investing',
          sourceDescription: null,
          value: toProvenanceEntryValue(capexes[i]),
        },
      ];
    }),
  ];

  return {
    symbol,
    metricCode: 'debtToFcf',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `分子有息負債 = 短期借款+應付公司債+長期借款（見上方前 3 筆原始欄位相加），有息負債＝${totalDebt ?? 'null'}。分母 FCF(TTM) = OCF + 資本支出（資本支出帶負號，相加即為扣除），FCF(TTM)＝${complete ? fcfTtmSum.toString() : 'null'}。`,
  };
};
