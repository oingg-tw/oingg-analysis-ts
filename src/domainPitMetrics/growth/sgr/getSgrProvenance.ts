import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { pickEquityWithFieldKey as pickEquity, pickNetIncomeWithFieldKey as pickNetIncome } from '@/domainPitMetrics/shared/pickers';
import { getBalanceSheetXbrlFirst as getQuarterlyBalanceSheet } from '@/models/mops/balanceSheetXbrlFirst';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/models/mops/incomeStatementXbrlFirst';
import { getCashFlowStatementXbrlFirst as getQuarterlyCashFlowStatement } from '@/models/mops/cashFlowStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import { toPercent, round2 } from '@/domainPitMetrics/shared/numericHelpers';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求擴大稽核鏈——sgr(TTM) = ROE(TTM) × (1 - 配息率(TTM)/100)。不依賴
// roe/dividendPayoutRatio 這兩個 metric_code 已寫入的值，獨立重新查資產負債表/損益表/
// 現金流量表重算，跟 computeSgrPit.ts 一致（同一份原則見該檔案的說明）。固定回傳 TTM。

export const getSgrProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['balanceSheet', 'incomeStatement', 'cashFlowStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'sgr', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const balanceSheet = await getQuarterlyBalanceSheet({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const equity = pickEquity(balanceSheet);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) =>
      Promise.all([
        getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
        getQuarterlyCashFlowStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }),
      ])
    )
  );

  const netIncomes = ttmRecords.map(([incomeRecord]) => pickNetIncome(incomeRecord));
  const dividendsPaid = ttmRecords.map(([, cashFlowRecord]) => cashFlowRecord?.dividendsPaid ?? null);

  let netIncomeTtmSum = 0n;
  let dividendsPaidTtmSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (netIncomes[i]!.value === null) {
      complete = false;
    } else {
      netIncomeTtmSum += netIncomes[i]!.value!;
      dividendsPaidTtmSum += dividendsPaid[i] ?? 0n;
    }
  }

  const roeTtm = complete && equity.value !== null ? toPercent(netIncomeTtmSum, equity.value) : null;
  const dividendsPaidAbs = dividendsPaidTtmSum < 0n ? -dividendsPaidTtmSum : dividendsPaidTtmSum;
  const payoutRatioTtm = complete && netIncomeTtmSum > 0n ? toPercent(dividendsPaidAbs, netIncomeTtmSum) : null;
  const value = roeTtm !== null && payoutRatioTtm !== null ? round2(roeTtm * (1 - payoutRatioTtm / 100)) : null;

  const entries: ProvenanceEntry[] = [
    { role: '本季期末權益（ROE 分母）', fiscalYear, fiscalQuarter: seasonNum, type: 'statementField', statementType: 'balanceSheet', fieldKey: equity.fieldKey, sourceDescription: null, value: toProvenanceEntryValue(equity.value) },
    ...ttmQuarters.flatMap((tq, i): ProvenanceEntry[] => {
      const entryFiscalYear = rocYearToGregorian(Number(tq.year));
      const entryFiscalQuarter = Number(tq.season);
      return [
        {
          role: `TTM 淨利（第 ${i + 1}/4 季，用於 ROE 與配息率）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'incomeStatement' as const,
          fieldKey: netIncomes[i]!.fieldKey,
          sourceDescription: null,
          value: toProvenanceEntryValue(netIncomes[i]!.value),
        },
        {
          role: `TTM 發放股利（第 ${i + 1}/4 季，用於配息率，原始資料是現金流出負值）`,
          fiscalYear: entryFiscalYear,
          fiscalQuarter: entryFiscalQuarter,
          type: 'statementField' as const,
          statementType: 'cashFlowStatement' as const,
          fieldKey: 'dividends_paid_financing',
          sourceDescription: null,
          value: toProvenanceEntryValue(dividendsPaid[i]),
        },
      ];
    }),
  ];

  return {
    symbol,
    metricCode: 'sgr',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value,
    entries,
    methodologyNote: `ROE(TTM)＝${roeTtm ?? 'null'}，配息率(TTM)＝${payoutRatioTtm ?? 'null'}，兩者皆是計算出的中繼值，不是財報原始欄位（見上方原始欄位）。sgr = ROE(TTM) × (1 - 配息率(TTM)/100)。`,
  };
};
