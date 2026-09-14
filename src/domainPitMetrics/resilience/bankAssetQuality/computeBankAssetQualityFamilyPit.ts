import { getBankAssetQualityTotalLoans, getLatestQuarterWithBankAssetQuality } from '@/shared/sourceData/bankRegulatoryXbrl';
import { isFinancialIndustryCompany } from '@/shared/sourceData/securitiesIndustry';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, periodTypeGroup } from '../../metricValueWriter';
import type { BasisOutcome, QuarterlyPitOutcomeBase } from '../../pitOutcome';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import { calculateBankNplRatio } from '@/domainPitMetrics/resilience/bankNplRatio/calculateBankNplRatio';
import { calculateBankNplCoverageRatio } from '@/domainPitMetrics/resilience/bankNplCoverageRatio/calculateBankNplCoverageRatio';

// 全新的銀行業專屬指標，不是舊架構遷移——src/domainMetrics/ 從來沒有銀行業指標的既有檔案。
// 2026-09-06 盤點技術債時直接查 mops-ts export DB 驗證過：`bank_asset_quality_xbrl` 的
// category='TotalLoans' 列就是新聞常講的「全行逾放比／備抵呆帳覆蓋率」，非全國放款分類明細，
// 覆蓋約 19-20 檔銀行/金控股，每季都有資料。兩個 metric_code（逾放比+覆蓋率）都是直接讀
// mops-ts 已經算好的比率，本服務不用自己推公式——跟其他指標「自己重新查原始表算」不同，
// 是因為這裡的「原始資料」本身就已經是比率（銀行監理揭露格式本來就要求申報比率）。
// 只有 Q 一種 basis：這是資產負債表時點快照，沒有 TTM/年化概念。
// 2026-09-14 修正：原本「非銀行公司、或銀行這季沒揭露，一律優雅降級成 null，不做前置
// 判斷」——這個設計假設上游來源表（bank_capital_adequacy_detail_xbrl 判斷銀行清單用的
// eligible_capital 欄位）只會對真的銀行給非 null 值，圖的是簡單，不用額外查一次產業分類。
// 但實測抓到反例：2330（半導體業）曾經在該表某一季出現非 null 的誤植列，導致上游「這一季
// 有哪些銀行」偵測誤判，觸發這支函式對 2330 做一次注定產出 null 的無意義查詢——使用者
// 認定這是必須避免的錯誤，改成在碰資料庫之前先用產業分類擋掉，見下方判斷。

export interface BankAssetQualityFamilyPitOutcome extends QuarterlyPitOutcomeBase {
  bankNplRatio: BasisOutcome;
  bankNplCoverageRatio: BasisOutcome;
}

export const computeAndWriteBankAssetQualityFamilyPit = async (query: QuarterlyMetricQuery): Promise<BankAssetQualityFamilyPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  if (!(await isFinancialIndustryCompany(symbol))) {
    return {
      symbol,
      rocYear: null,
      season: null,
      bankNplRatio: { action: 'skipped_no_quarter' },
      bankNplCoverageRatio: { action: 'skipped_no_quarter' },
    };
  }

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: Number(query.year), quarter: Number(query.season) }
      : await getLatestQuarterWithBankAssetQuality(symbol, dataType, subsidiaryCompanyId);

  if (!resolvedQuarter) {
    return {
      symbol,
      rocYear: null,
      season: null,
      bankNplRatio: { action: 'skipped_no_quarter' },
      bankNplCoverageRatio: { action: 'skipped_no_quarter' },
    };
  }

  const { year: rocYear, quarter: seasonNum } = resolvedQuarter;
  const fiscalYear = rocYearToGregorian(rocYear);

  const row = await getBankAssetQualityTotalLoans({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });

  const nplRatioCalc = calculateBankNplRatio(row?.nonPerformingLoansRatio);
  const coverageRatioCalc = calculateBankNplCoverageRatio(row?.coverageRatio);

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate: row?.reportDate ?? null }]);
  const coordinateBase = { symbol, fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let bankNplRatio: BasisOutcome;
  let bankNplCoverageRatio: BasisOutcome;
  if (!mainAnchor) {
    bankNplRatio = { action: 'skipped_no_knowledge_date' };
    bankNplCoverageRatio = { action: 'skipped_no_knowledge_date' };
  } else {
    bankNplRatio = await writeMetricValue({
      ...coordinateBase,
      metricCode: 'bankNplRatio',
      ...periodTypeGroup('Q'),
      value: nplRatioCalc.value,
      nullReason: nplRatioCalc.nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
    bankNplCoverageRatio = await writeMetricValue({
      ...coordinateBase,
      metricCode: 'bankNplCoverageRatio',
      ...periodTypeGroup('Q'),
      value: coverageRatioCalc.value,
      nullReason: coverageRatioCalc.nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: String(rocYear), season: String(seasonNum), bankNplRatio, bankNplCoverageRatio };
};
