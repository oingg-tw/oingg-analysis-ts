import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement, type IncomeStatementFields } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { calculateDupontTaxBurden } from './calculateDupontTaxBurden';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-09-13 使用者要求：GET /companies/:symbol/metric-provenance 擴大到 dupontTaxBurden。
// 現查現算不持久化，跟 getRoeProvenance.ts 同一個模式——刻意不動 computeDupontFamilyPit.ts
// 那支「一次查詢算 9 個 metricCode」的編排檔案（風險比重寫獨立資源大很多，尤其現在還有
// 全市場全歷史 backfill 在跑），這裡自己重新查一次損益表算出同樣的數字，兩邊算法應該
// 完全一致（都呼叫同一支 calculateDupontTaxBurden 純函式）。固定回傳 TTM（跟 roe 同一個
// 試點慣例，Q 版的欄位組成比較簡單，之後真的需要再開放 periodType 查詢參數）。

interface PickedField {
  value: bigint | null;
  fieldKey: string | null;
}

const pickNetIncome = (record: IncomeStatementFields | null): PickedField => {
  if (!record) return { value: null, fieldKey: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent, fieldKey: 'profit_loss_attributable_to_owners_of_parent' };
  if (record.netIncome !== null) return { value: record.netIncome, fieldKey: 'profit_loss' };
  return { value: null, fieldKey: null };
};

export const getDupontTaxBurdenProvenance = async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, metricCode: 'dupontTaxBurden', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const ttmQuarters = getPastNQuarters({ rocYear, season: season as Season }, 4);
  const ttmRecords = await Promise.all(
    ttmQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );

  const netIncomes = ttmRecords.map(pickNetIncome);
  const preTaxes = ttmRecords.map((record) => record?.profitBeforeTax ?? null);

  let netIncomeSum = 0n;
  let preTaxSum = 0n;
  let complete = true;
  for (let i = 0; i < ttmRecords.length; i++) {
    if (netIncomes[i]!.value === null || preTaxes[i] === null) {
      complete = false;
    } else {
      netIncomeSum += netIncomes[i]!.value!;
      preTaxSum += preTaxes[i]!;
    }
  }

  const result = complete ? calculateDupontTaxBurden(netIncomeSum, preTaxSum) : { value: null, nullReason: 'insufficient_history' as const };

  const entries: ProvenanceEntry[] = ttmQuarters.flatMap((tq, i) => {
    const entryFiscalYear = rocYearToGregorian(Number(tq.year));
    const entryFiscalQuarter = Number(tq.season);
    return [
      {
        role: `TTM 淨利（第 ${i + 1}/4 季）`,
        fiscalYear: entryFiscalYear,
        fiscalQuarter: entryFiscalQuarter,
        type: 'statementField' as const,
        statementType: 'incomeStatement' as const,
        fieldKey: netIncomes[i]!.fieldKey,
        sourceDescription: null,
        value: toProvenanceEntryValue(netIncomes[i]!.value),
      },
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
    ];
  });

  return { symbol, metricCode: 'dupontTaxBurden', found: true, fiscalYear, fiscalQuarter: seasonNum, value: result.value, entries, methodologyNote: null };
};
