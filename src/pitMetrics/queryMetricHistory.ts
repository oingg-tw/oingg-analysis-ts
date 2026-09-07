import { z } from 'zod';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { MetricBasis } from './metricBasis';

export const metricHistoryEntrySchema = z.object({
  fiscalYear: z.number().meta({ description: '西元年（民國+1911）' }),
  fiscalQuarter: z.number().nullable(),
  value: z.number().nullable().meta({ description: '這期算出來的數字；null 代表這期算不出來，原因見 nullReason' }),
  nullReason: z
    .enum(['missing_input', 'zero_or_negative_denominator', 'not_applicable_industry', 'insufficient_history'])
    .nullable()
    .meta({ description: 'value 為 null 時的原因；value 非 null 時一律是 null' }),
  knowledgeDate: z.string().meta({ description: '這個值最早可被市場知道的日期（YYYY-MM-DD）' }),
  knowledgeDateIsFallback: z
    .boolean()
    .meta({ description: 'true 代表 knowledgeDate 是用財報期末日頂替（查無真實公告日），有 look-ahead bias 風險，前端可考慮標示' }),
});
export type MetricHistoryEntry = z.infer<typeof metricHistoryEntrySchema>;

export interface MetricHistoryResult {
  entries: MetricHistoryEntry[];
  // 這個 symbol/metricCode/basis 去重後總共有幾期資料（不受 limit 影響）——前端可以拿
  // 這個數字決定要不要提供「看更長區間」的選項（例如完整歷史只有 6 年，就不要讓使用者
  // 點下「近 10 年」，點了也只會拿到一樣的 6 年資料）。
  total: number;
  // = total > entries.length，等同於「還有更早的資料沒有回傳」；entries 固定是「最近 N
  // 期」，往前翻頁目前還做不到（見 abstract-crafting-journal.md 的相關規劃），這個欄位
  // 至少讓前端知道「有更多」跟「這就是全部」的差別。
  hasMore: boolean;
}

// 從 src/pitMetrics/profitability/roe/queryRoeHistory.ts 抽出來的通用版本：任何單一 metric_code 查
// metric_values 歷史時序都走這支，不用每支指標各自重寫一次「依 (fiscalYear,fiscalQuarter)
// 去重取最大 knowledge_date、切 limit、反轉成舊到新」的邏輯。live 語意：同一個座標如果有
// 多筆（重編疊加），只取 knowledge_date 最大的那筆，符合
// docs/analysis-ts-spec-v0.2.md §4.4「live 端點一律隱含取每組最大 knowledge_date」語義。
export const getMetricHistory = async (
  symbol: string,
  metricCode: string,
  basis: MetricBasis,
  dataType: '1' | '2',
  subsidiaryCompanyId: string,
  limit: number
): Promise<MetricHistoryResult> => {
  const rows = await analysisPrisma.metricValue.findMany({
    where: { symbol, metricCode, basis, dataType, subsidiaryCompanyId },
    orderBy: [{ fiscalYear: 'desc' }, { fiscalQuarter: 'desc' }, { knowledgeDate: 'desc' }],
  });

  const latestPerPeriod = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.fiscalYear}-${row.fiscalQuarter}`;
    if (!latestPerPeriod.has(key)) latestPerPeriod.set(key, row);
  }

  const allPeriods = [...latestPerPeriod.values()];
  const total = allPeriods.length;

  const entries = allPeriods
    .slice(0, limit)
    .reverse() // 轉成由舊到新，方便前端直接畫時序圖
    .map((row) => ({
      fiscalYear: row.fiscalYear,
      fiscalQuarter: row.fiscalQuarter,
      value: row.value === null ? null : Number(row.value),
      nullReason: row.nullReason as MetricHistoryEntry['nullReason'],
      knowledgeDate: row.knowledgeDate.toISOString().slice(0, 10),
      knowledgeDateIsFallback: row.knowledgeDateIsFallback,
    }));

  return { entries, total, hasMore: total > entries.length };
};
