import { z } from 'zod';
import { getMetricHistory, type MetricHistoryDeps, type MetricHistoryResult } from '../../shared/queryMetricHistory';
import type { PeriodType } from '../../../../domain/metrics/metricBasis';

export const roeHistoryEntrySchema = z.object({
  fiscalYear: z.number().meta({ description: '西元年（民國+1911）' }),
  fiscalQuarter: z.number().nullable(),
  value: z.number().nullable().meta({ description: 'ROE 百分比數字（例如 10.98 代表 10.98%）；null 代表這期算不出來，原因見 nullReason' }),
  nullReason: z
    .enum(['missing_input', 'zero_or_negative_denominator', 'not_applicable_industry', 'insufficient_history'])
    .nullable()
    .meta({ description: 'value 為 null 時的原因；value 非 null 時一律是 null' }),
  knowledgeDate: z.string().meta({
    description:
      '這個值最早可被市場知道的日期（YYYY-MM-DD）。注意這不是「最後更新時間」，不能當快取鍵——公式改版重算時值會被改寫、但 knowledgeDate 不變（2026-09-23 的分母改期間平均就是這樣）。我們重算後會主動通知下游清快取。',
  }),
  knowledgeDateIsFallback: z
    .boolean()
    .meta({ description: 'true 代表 knowledgeDate 是用財報期末日頂替（查無真實公告日），有 look-ahead bias 風險，前端可考慮標示' }),
});

// 給前端畫圖用：單一公司 ROE 歷史時序，第一支直接對外曝露 metric_values（不是
// profitability_roe）的端點。實際查詢邏輯 2026-09-06 抽成通用的 src/domainPitMetrics/queryMetricHistory.ts
// （第二批 ROA/Dupont 遷移時抽出，因為同一套「查 metric_values、依期別去重取最大
// knowledge_date、切 limit、反轉成舊到新」的邏輯不該每支指標重寫一次）——這裡只是薄包裝，
// 對外的 roeHistoryEntrySchema/getRoeHistory 匯出名稱/形狀不變，controller.ts/openapi.ts
// 既有的 import 不用動。
//
// 目前資料覆蓋率極低——只有 ROE spike 手動 backfill 過的少數公司/季度（見
// scripts/backfillRoePit.ts：2330/2887/2317，113Q3~115Q2），大部分公司查詢會得到空陣列，
// 這是預期行為不是錯誤；全市場/多年 backfill 是下一步，這支先把讀取路徑打通。
//
// dataType/subsidiaryCompanyId 固定用合併報表('2')、母公司本身('')，不開放使用者選——
// BFF 面向的端點目前一律不曝露
// 這兩個內部細節維度。
// ROE 只落在季報型（periodType，值域 Q/Q_ANN/TTM），2026-09-09 拆表後 getMetricHistory
// 已經是純季報型函式，直接傳 periodType 即可，不用再組四欄位的 basisGroup。
export const getRoeHistory = async (symbol: string, periodType: PeriodType, limit: number, deps: MetricHistoryDeps): Promise<MetricHistoryResult> =>
  getMetricHistory(symbol, 'roe', periodType, await deps.reportAvailability.resolveDataType(symbol), '', limit, deps);
