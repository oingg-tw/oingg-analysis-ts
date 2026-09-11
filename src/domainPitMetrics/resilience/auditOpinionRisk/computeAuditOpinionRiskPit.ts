import { getLatestQuarterWithAuditOpinionXbrl, getAuditOpinionXbrlFirst } from '@/shared/sourceData/auditOpinionXbrl';
import { rocYearToGregorian } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

// 2026-09-11 應 web-nuxt/bff-ts 要求新增——查核意見類型的風險分數版本，見
// @/shared/sourceData/auditOpinionXbrl.ts 檔頭說明（0~4 序列風險分數，使用者拍板的
// 編碼方式）。這是分類值編碼成數字，不是財報數字的四則運算，跟其餘 pitMetrics 的
// 「比率/複合模型」性質不同，但沿用同一套 QuarterlyMetricQuery/writeMetricValue 管線
// （只有 Q 一種 basis，查核意見本來就是逐季公告，沒有 TTM/YTD 概念）。5 個旗標全 null
// （落在未涵蓋分類，例如否定意見，或文件本身沒揭露）視為 missing_input，不是查詢失敗。

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface AuditOpinionRiskPitOutcome {
  symbol: string;
  rocYear: number | null;
  season: number | null;
  q: BasisOutcome;
}

export const computeAndWriteAuditOpinionRiskPit = async (query: QuarterlyMetricQuery): Promise<AuditOpinionRiskPitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: Number(query.year), quarter: Number(query.season) }
      : await getLatestQuarterWithAuditOpinionXbrl(symbol, dataType, subsidiaryCompanyId);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { year: rocYear, quarter: seasonNum } = resolvedQuarter;
  const fiscalYear = rocYearToGregorian(rocYear);

  const opinion = await getAuditOpinionXbrlFirst({ symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId });
  const reportDate = opinion?.reportDate ?? null;
  const riskScore = opinion?.riskScore ?? null;
  const nullReason: MetricNullReason | null = riskScore === null ? 'missing_input' : null;

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'auditOpinionRisk', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('Q'),
      value: riskScore,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear, season: seasonNum, q };
};
