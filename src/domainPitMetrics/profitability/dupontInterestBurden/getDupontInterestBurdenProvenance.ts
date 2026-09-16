import { resolveQuarterOrLatest } from '@/models/latestQuarter';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/models/mops/incomeStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { calculateEbit } from '../../shared/dupont/ebit';
import { calculateDupontInterestBurden } from './calculateDupontInterestBurden';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求：GET /companies/:symbol/metric-provenance 擴大到
// dupontInterestBurden。跟 getDupontTaxBurdenProvenance.ts 同一個模式（現查現算不持久化，
// 不動 computeDupontFamilyPit.ts 的編排邏輯，兩邊都呼叫同一支 calculateEbit/
// calculateDupontInterestBurden 純函式，數字應該完全一致）。固定回傳 TTM。
//
// EBIT = 稅前淨利 + 財務費用，本身不是財報原始欄位，是本服務的衍生中繼值——稽核鏈只列出
// 兩個真正的原始欄位（profit_loss_before_tax/finance_costs），methodologyNote 說明
// EBIT 是這兩者相加得出，不硬塞一個不存在的 fieldKey。

export const getDupontInterestBurdenProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'dupontInterestBurden', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  const preTaxes = ttmRecords.map((record) => record?.profitBeforeTax ?? null);
  const financeCosts = ttmRecords.map((record) => record?.financeCosts ?? null);

  let preTaxSum = 0n;
  let ebitSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (preTaxes[i] === null || financeCosts[i] === null) {
      complete = false;
    } else {
      preTaxSum += preTaxes[i]!;
      ebitSum += calculateEbit(preTaxes[i] ?? null, financeCosts[i] ?? null)!;
    }
  }

  const result = complete ? calculateDupontInterestBurden(preTaxSum, ebitSum) : { value: null, nullReason: 'insufficient_history' as const };

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i) => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `TTM 稅前淨利（第 ${i + 1}/4 季）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: 'profit_loss_before_tax',
        sourceDescription: null,
        value: toProvenanceEntryValue(preTaxes[i]),
      },
      {
        role: `TTM 財務費用（第 ${i + 1}/4 季，跟稅前淨利相加得出 EBIT）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: 'finance_costs',
        sourceDescription: null,
        value: toProvenanceEntryValue(financeCosts[i]),
      },
    ];
  });

  return {
    symbol,
    metricCode: 'dupontInterestBurden',
    found: true,
    fiscalYear,
    fiscalQuarter: seasonNum,
    value: result.value,
    entries,
    methodologyNote: 'EBIT 不是財報原始欄位，是稅前淨利 + 財務費用相加得出的中繼值，見上方兩筆原始欄位。',
  };
};
