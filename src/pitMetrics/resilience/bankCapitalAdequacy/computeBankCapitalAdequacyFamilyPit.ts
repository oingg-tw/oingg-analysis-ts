import { getBankCapitalAdequacy, getLatestQuarterWithBankCapitalAdequacy } from '@/shared/sourceData/bankRegulatoryXbrl';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import { calculateBankCarRatio } from '@/pitMetrics/resilience/bankCarRatio/calculateBankCarRatio';
import { calculateBankCet1Ratio } from '@/pitMetrics/resilience/bankCet1Ratio/calculateBankCet1Ratio';
import { calculateBankTier1Ratio } from '@/pitMetrics/resilience/bankTier1Ratio/calculateBankTier1Ratio';

// 全新的銀行業專屬指標，不是舊架構遷移。2026-09-06 盤點技術債時直接查 mops-ts export DB
// 驗證過：`bank_capital_adequacy_detail_xbrl` 只覆蓋 6-7 檔銀行/金控股，且只有 Q2/Q4 有
// 真實值（監理揭露頻率本來就是半年一次，不是資料缺漏，Q1/Q3 的相關欄位一律 null）。
// bankCet1Ratio/bankTier1Ratio 直接讀 mops-ts 已經算好的比率；bankCarRatio（總資本適足率）
// 是這批唯一自己做除法的欄位（eligible_capital / risk_weighted_assets），其餘都是 passthrough。
// 只有 Q 一種 basis，同一次查詢寫三個 metric_code，共用同一組 knowledge_date。

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

  const carRatioCalc = calculateBankCarRatio(row?.eligibleCapital, row?.riskWeightedAssets);
  const cet1Calc = calculateBankCet1Ratio(row?.ratioOrdinaryShareEquityToRwa);
  const tier1Calc = calculateBankTier1Ratio(row?.ratioTierICapitalToRwa);

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
      ...periodTypeGroup('Q'),
      value: carRatioCalc.value,
      nullReason: carRatioCalc.nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
    bankCet1Ratio = await writeMetricValue({
      ...coordinateBase,
      metricCode: 'bankCet1Ratio',
      ...periodTypeGroup('Q'),
      value: cet1Calc.value,
      nullReason: cet1Calc.nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
    bankTier1Ratio = await writeMetricValue({
      ...coordinateBase,
      metricCode: 'bankTier1Ratio',
      ...periodTypeGroup('Q'),
      value: tier1Calc.value,
      nullReason: tier1Calc.nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: String(rocYear), season: String(seasonNum), bankCarRatio, bankCet1Ratio, bankTier1Ratio };
};
