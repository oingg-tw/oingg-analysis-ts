import { getBankCapitalAdequacy, getLatestQuarterWithBankCapitalAdequacy } from '@/shared/sourceData/bankRegulatoryXbrl';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../knowledgeDate';
import { rocYearToGregorian } from '../rocYear';
import { writeMetricValue, type MetricValueWriteOutcome } from '../metricValueWriter';
import type { MetricNullReason } from '../metricBasis';

// 全新的銀行業專屬指標，不是舊架構遷移。2026-09-06 盤點技術債時直接查 mops-ts export DB
// 驗證過：`bank_capital_adequacy_detail_xbrl` 只覆蓋 6-7 檔銀行/金控股，且只有 Q2/Q4 有
// 真實值（監理揭露頻率本來就是半年一次，不是資料缺漏，Q1/Q3 的相關欄位一律 null）。
// bankCet1Ratio/bankTier1Ratio 直接讀 mops-ts 已經算好的比率；bankCarRatio（總資本適足率）
// 是這批唯一自己做除法的欄位（eligible_capital / risk_weighted_assets），其餘都是 passthrough。
// 只有 Q 一種 basis，同一次查詢寫三個 metric_code，共用同一組 knowledge_date。

const toRatio = (numerator: bigint | null, denominator: bigint | null): number | null => {
  if (numerator === null || denominator === null || denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface BankCapitalAdequacyFamilyPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  bankCarRatio: BasisOutcome;
  bankCet1Ratio: BasisOutcome;
  bankTier1Ratio: BasisOutcome;
}

export const computeAndWriteBankCapitalAdequacyFamilyPit = async (query: QuarterlyMetricQuery): Promise<BankCapitalAdequacyFamilyPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: Number(query.year), quarter: Number(query.season) }
      : await getLatestQuarterWithBankCapitalAdequacy(symbol, dataType, subsidiaryCompanyId);

  if (!resolvedQuarter) {
    return {
      symbol,
      rocYear: null,
      season: null,
      bankCarRatio: { action: 'skipped_no_quarter' },
      bankCet1Ratio: { action: 'skipped_no_quarter' },
      bankTier1Ratio: { action: 'skipped_no_quarter' },
    };
  }

  const { year: rocYear, quarter: seasonNum } = resolvedQuarter;
  const fiscalYear = rocYearToGregorian(rocYear);

  const row = await getBankCapitalAdequacy({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });

  const carRatio = row ? toRatio(row.eligibleCapital, row.riskWeightedAssets) : null;
  let carNullReason: MetricNullReason | null = null;
  if (carRatio === null) {
    if (row?.eligibleCapital == null || row?.riskWeightedAssets == null) carNullReason = 'missing_input';
    else carNullReason = 'zero_or_negative_denominator';
  }

  const cet1NullReason: MetricNullReason | null = row?.ratioOrdinaryShareEquityToRwa == null ? 'missing_input' : null;
  const tier1NullReason: MetricNullReason | null = row?.ratioTierICapitalToRwa == null ? 'missing_input' : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: row?.reportDate ?? null }]);
  const coordinateBase = { symbol, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let bankCarRatio: BasisOutcome;
  let bankCet1Ratio: BasisOutcome;
  let bankTier1Ratio: BasisOutcome;
  if (!mainAnchor) {
    bankCarRatio = { action: 'skipped_no_knowledge_date' };
    bankCet1Ratio = { action: 'skipped_no_knowledge_date' };
    bankTier1Ratio = { action: 'skipped_no_knowledge_date' };
  } else {
    bankCarRatio = await writeMetricValue({
      ...coordinateBase,
      metricCode: 'bankCarRatio',
      basis: 'Q',
      value: carRatio,
      nullReason: carNullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
    bankCet1Ratio = await writeMetricValue({
      ...coordinateBase,
      metricCode: 'bankCet1Ratio',
      basis: 'Q',
      value: row?.ratioOrdinaryShareEquityToRwa ?? null,
      nullReason: cet1NullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
    bankTier1Ratio = await writeMetricValue({
      ...coordinateBase,
      metricCode: 'bankTier1Ratio',
      basis: 'Q',
      value: row?.ratioTierICapitalToRwa ?? null,
      nullReason: tier1NullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: String(rocYear), season: String(seasonNum), bankCarRatio, bankCet1Ratio, bankTier1Ratio };
};
