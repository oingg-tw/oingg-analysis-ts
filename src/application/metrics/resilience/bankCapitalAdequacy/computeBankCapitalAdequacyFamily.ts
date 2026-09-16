import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import { calculateBankCarRatio } from '@/domain/metrics/resilience/bankCarRatio/calculateBankCarRatio';
import { calculateBankCet1Ratio } from '@/domain/metrics/resilience/bankCet1Ratio/calculateBankCet1Ratio';
import { calculateBankTier1Ratio } from '@/domain/metrics/resilience/bankTier1Ratio/calculateBankTier1Ratio';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, type ComputationBatch, type ComputationSlot, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// 全新的銀行業專屬指標，不是舊架構遷移。2026-09-06 盤點技術債時直接查 mops-ts export DB
// 驗證過：`bank_capital_adequacy_detail_xbrl` 只覆蓋 6-7 檔銀行/金控股，且只有 Q2/Q4 有
// 真實值（監理揭露頻率本來就是半年一次，不是資料缺漏，Q1/Q3 的相關欄位一律 null）。
// bankCet1Ratio/bankTier1Ratio 直接讀 mops-ts 已經算好的比率；bankCarRatio（總資本適足率）
// 是這批唯一自己做除法的欄位（eligible_capital / risk_weighted_assets），其餘都是 passthrough。
// 只有 Q 一種 basis，同一次查詢寫三個 metric_code，共用同一組 knowledge_date。


export type BankCapitalAdequacyFamilyDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'industry'>;

export type BankCapitalAdequacyFamilyComputationBatch = ComputationBatch<'bankCarRatio' | 'bankCet1Ratio' | 'bankTier1Ratio'>;

export const computeBankCapitalAdequacyFamily = async (query: QuarterlyMetricQuery, deps: BankCapitalAdequacyFamilyDeps): Promise<BankCapitalAdequacyFamilyComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  // 2026-09-14 使用者要求：`bank_capital_adequacy_detail_xbrl` 的來源資料曾經對非銀行公司
  // （例如 2330）出現過 eligible_capital 非 null 的誤植列，導致上游「這一季有哪些銀行」
  // 的偵測（getBankSymbolsForQuarter，見 backfillFullHistoryFullMarketPit.ts/
  // scanMetricGapsPit.ts）誤判成銀行、觸發這支函式對非銀行公司做一次注定產出 null 的
  // 無意義查詢。這裡在碰資料庫之前先用產業分類擋掉，不管上游來源表資料再怎麼髒，非金融
  // 保險業（industry='17'）的公司都不會走到下面任何一次查詢——不寫入任何 metric_value
  // 列（不是 not_applicable_industry，因為銀行資本適足率這三個 metricCode 本來就不該對
  // 非銀行公司存在任何一列，寫 not_applicable_industry 反而製造沒必要的噪音列）。
  if (!(await deps.industry.isFinancialIndustryCompany(symbol))) {
    return noQuarterBatch(symbol, ['bankCarRatio', 'bankCet1Ratio', 'bankTier1Ratio']);
  }

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: Number(query.year), quarter: Number(query.season) }
      : await deps.quarters.latestQuarterWith('bankCapitalAdequacy', symbol, dataType, subsidiaryCompanyId);

  if (!resolvedQuarter) {
    return noQuarterBatch(symbol, ['bankCarRatio', 'bankCet1Ratio', 'bankTier1Ratio']);
  }

  const { year: rocYear, quarter: seasonNum } = resolvedQuarter;
  const fiscalYear = rocYearToGregorian(rocYear);

  const row = await deps.statements.getBankCapitalAdequacy({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });

  const carRatioCalc = calculateBankCarRatio(row?.eligibleCapital, row?.riskWeightedAssets);
  const cet1Calc = calculateBankCet1Ratio(row?.ratioOrdinaryShareEquityToRwa);
  const tier1Calc = calculateBankTier1Ratio(row?.ratioTierICapitalToRwa);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: row?.reportDate ?? null }], deps.announcements);
  const coordinateBase = { symbol, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let bankCarRatio: ComputationSlot;
  let bankCet1Ratio: ComputationSlot;
  let bankTier1Ratio: ComputationSlot;
  if (!mainAnchor) {
    bankCarRatio = { action: 'skipped_no_knowledge_date' };
    bankCet1Ratio = { action: 'skipped_no_knowledge_date' };
    bankTier1Ratio = { action: 'skipped_no_knowledge_date' };
  } else {
    bankCarRatio = computation({
      ...coordinateBase,
      metricCode: 'bankCarRatio',
      ...periodTypeGroup('Q'),
      value: carRatioCalc.value,
      nullReason: carRatioCalc.nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
    bankCet1Ratio = computation({
      ...coordinateBase,
      metricCode: 'bankCet1Ratio',
      ...periodTypeGroup('Q'),
      value: cet1Calc.value,
      nullReason: cet1Calc.nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
    bankTier1Ratio = computation({
      ...coordinateBase,
      metricCode: 'bankTier1Ratio',
      ...periodTypeGroup('Q'),
      value: tier1Calc.value,
      nullReason: tier1Calc.nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: String(rocYear), season: String(seasonNum), slots: { bankCarRatio, bankCet1Ratio, bankTier1Ratio } };
};
