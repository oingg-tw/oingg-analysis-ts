import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { calculateBankNplRatio } from '@/domain/metrics/resilience/bankNplRatio/calculateBankNplRatio';
import { calculateBankNplCoverageRatio } from '@/domain/metrics/resilience/bankNplCoverageRatio/calculateBankNplCoverageRatio';
import { toProvenanceEntryValue, type MetricProvenanceResult } from '../../shared/provenance/provenanceTypes';
import type { PitDeps } from '@/application/metrics/deps';
import { resolveBankAssetQualityQuarter } from './computeBankAssetQualityFamily';

// 2026-10-01 使用者要求溯源表全部補齊：逾放比／備抵呆帳覆蓋率。兩支都是直接採用銀行申報的比率（全行放款合計那一列），
// 跟 compute 共用 resolveBankAssetQualityQuarter 與同一支 calculate 函式，值保證一致；來源不屬三大表，entry 用 type 'other'。
type BankAssetQualityCode = 'bankNplRatio' | 'bankNplCoverageRatio';

export const getBankAssetQualityProvenance = (metricCode: BankAssetQualityCode, deps: Pick<PitDeps, 'statements' | 'quarters' | 'industry'>) =>
  async (query: QuarterlyMetricQuery): Promise<MetricProvenanceResult> => {
    const resolved = await resolveBankAssetQualityQuarter(query, deps);
    if (!resolved) {
      return { symbol: query.symbol, metricCode, found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null };
    }
    const { fiscalYear, seasonNum: fiscalQuarter, row } = resolved;
    const { role, raw, value } =
      metricCode === 'bankNplRatio'
        ? { role: '逾期放款比率（申報值，%）', raw: row?.nonPerformingLoansRatio, value: calculateBankNplRatio(row?.nonPerformingLoansRatio).value }
        : { role: '備抵呆帳覆蓋率（申報值，%）', raw: row?.coverageRatio, value: calculateBankNplCoverageRatio(row?.coverageRatio).value };

    return {
      symbol: query.symbol,
      metricCode,
      found: true,
      fiscalYear,
      fiscalQuarter,
      value,
      entries: [{ role, fiscalYear, fiscalQuarter, type: 'other', statementType: null, fieldKey: null, sourceDescription: '銀行資產品質揭露（XBRL 申報，全行放款合計）', value: toProvenanceEntryValue(raw) }],
      methodologyNote: '直接採用銀行申報的全行放款合計比率，不另行計算。',
    };
  };
