import { getBankAssetQualityTotalLoans, getLatestQuarterWithBankAssetQuality } from '@/shared/sourceData/bankRegulatoryXbrl';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import { calculateBankNplRatio } from '@/pitMetrics/resilience/bankNplRatio/calculateBankNplRatio';
import { calculateBankNplCoverageRatio } from '@/pitMetrics/resilience/bankNplCoverageRatio/calculateBankNplCoverageRatio';

// 全新的銀行業專屬指標，不是舊架構遷移——src/domainMetrics/ 從來沒有銀行業指標的既有檔案。
// 2026-09-06 盤點技術債時直接查 mops-ts export DB 驗證過：`bank_asset_quality_xbrl` 的
// category='TotalLoans' 列就是新聞常講的「全行逾放比／備抵呆帳覆蓋率」，非全國放款分類明細，
// 覆蓋約 19-20 檔銀行/金控股，每季都有資料。兩個 metric_code（逾放比+覆蓋率）都是直接讀
// mops-ts 已經算好的比率，本服務不用自己推公式——跟其他指標「自己重新查原始表算」不同，
// 是因為這裡的「原始資料」本身就已經是比率（銀行監理揭露格式本來就要求申報比率）。
// 只有 Q 一種 basis：這是資產負債表時點快照，沒有 TTM/年化概念。非銀行公司、或銀行這季
// 沒揭露，一律優雅降級成 null（missing_input），不做「這家公司是不是銀行」的前置判斷。

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface BankAssetQualityFamilyPitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  bankNplRatio: BasisOutcome;
  bankNplCoverageRatio: BasisOutcome;
}

export const computeAndWriteBankAssetQualityFamilyPit = async (query: QuarterlyMetricQuery): Promise<BankAssetQualityFamilyPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

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
