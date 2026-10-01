import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { calculateBankCarRatio } from '@/domain/metrics/resilience/bankCarRatio/calculateBankCarRatio';
import { calculateBankCet1Ratio } from '@/domain/metrics/resilience/bankCet1Ratio/calculateBankCet1Ratio';
import { calculateBankTier1Ratio } from '@/domain/metrics/resilience/bankTier1Ratio/calculateBankTier1Ratio';
import { toProvenanceEntryValue, type MetricProvenanceResult, type ProvenanceEntry } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveBankCapitalAdequacyQuarter } from './computeBankCapitalAdequacyFamily';

// 2026-10-01 使用者要求溯源表全部補齊（「溯源表請務必都加上」）：銀行資本適足三支。跟 compute 共用
// resolveBankCapitalAdequacyQuarter（產業擋門、季度解析、讀同一列），值用同一支 calculate 函式算，保證跟 metric_values 一致。
// 來源是銀行監理揭露表，不屬於三大表 statementType 的任何一種，所以 entry 一律 type 'other'（不改共用 schema）。
// 只有 Q：監理揭露是時點值，而且半年一次（Q1/Q3 欄位全空，自動抓最新一季時 repository 只看有合格資本的季度）。
type BankCapitalAdequacyCode = 'bankCarRatio' | 'bankCet1Ratio' | 'bankTier1Ratio';

const SOURCE = '銀行資本適足性揭露（XBRL 申報）';

export const getBankCapitalAdequacyProvenance = (metricCode: BankCapitalAdequacyCode, deps: Pick<PitDeps, 'statements' | 'quarters' | 'industry'>) =>
  async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
    const resolved = await resolveBankCapitalAdequacyQuarter(query, deps);
    if (!resolved) {
      return { symbol: query.symbol, metricCode, found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
    }
    const { fiscalYear, seasonNum: fiscalQuarter, row } = resolved;
    const entry = (role: string, value: bigint | number | null | undefined): ProvenanceEntry => ({
      role, fiscalYear, fiscalQuarter, type: 'other', statementType: null, fieldKey: null, sourceDescription: SOURCE, value: toProvenanceEntryValue(value),
    });

    const byCode = {
      bankCarRatio: {
        value: calculateBankCarRatio(row?.eligibleCapital, row?.riskWeightedAssets).value,
        entries: [entry('合格自有資本淨額（千元）', row?.eligibleCapital), entry('風險性資產總額（千元）', row?.riskWeightedAssets)],
        note: '資本適足率 = 合格自有資本淨額 ÷ 風險性資產總額 × 100%。監理揭露半年一次，只有第 2、4 季有值。',
      },
      bankCet1Ratio: {
        value: calculateBankCet1Ratio(row?.ratioOrdinaryShareEquityToRwa).value,
        entries: [entry('普通股權益比率（申報值，%）', row?.ratioOrdinaryShareEquityToRwa)],
        note: '直接採用銀行申報的普通股權益比率，不另行計算。監理揭露半年一次，只有第 2、4 季有值。',
      },
      bankTier1Ratio: {
        value: calculateBankTier1Ratio(row?.ratioTierICapitalToRwa).value,
        entries: [entry('第一類資本比率（申報值，%）', row?.ratioTierICapitalToRwa)],
        note: '直接採用銀行申報的第一類資本比率，不另行計算。監理揭露半年一次，只有第 2、4 季有值。',
      },
    }[metricCode];

    return { symbol: query.symbol, metricCode, found: true, fiscalYear, fiscalQuarter, value: byCode.value, entries: byCode.entries, methodologyNote: byCode.note };
  };
