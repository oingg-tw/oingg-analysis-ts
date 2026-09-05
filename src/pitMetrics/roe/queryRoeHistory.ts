import { z } from 'zod';
import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import type { MetricBasis } from '../metricBasis';

export const roeHistoryEntrySchema = z.object({
  fiscalYear: z.number().meta({ description: '西元年（民國+1911）' }),
  fiscalQuarter: z.number().nullable(),
  value: z.number().nullable().meta({ description: 'ROE 百分比數字（例如 10.98 代表 10.98%）；null 代表這期算不出來，原因見 nullReason' }),
  nullReason: z
    .enum(['missing_input', 'zero_or_negative_denominator', 'not_applicable_industry', 'insufficient_history'])
    .nullable()
    .meta({ description: 'value 為 null 時的原因；value 非 null 時一律是 null' }),
  knowledgeDate: z.string().meta({ description: '這個值最早可被市場知道的日期（YYYY-MM-DD）' }),
  knowledgeDateIsFallback: z
    .boolean()
    .meta({ description: 'true 代表 knowledgeDate 是用財報期末日頂替（查無真實公告日），有 look-ahead bias 風險，前端可考慮標示' }),
});
export type RoeHistoryEntry = z.infer<typeof roeHistoryEntrySchema>;

// 給前端畫圖用：單一公司 ROE 歷史時序，第一支直接對外曝露 metric_values（不是
// profitability_roe）的端點。live 語意：同一個 (fiscalYear, fiscalQuarter) 座標如果有
// 多筆（重編疊加），只取 knowledge_date 最大的那筆，符合
// docs/analysis-ts-spec-v0.2.md §4.4「live 端點一律隱含取每組最大 knowledge_date」語義。
//
// 目前資料覆蓋率極低——只有 ROE spike 手動 backfill 過的少數公司/季度（見
// scripts/backfillRoePit.ts：2330/2887/2317，113Q3~115Q2），大部分公司查詢會得到空陣列，
// 這是預期行為不是錯誤；全市場/多年 backfill 是下一步，這支先把讀取路徑打通。
//
// dataType/subsidiaryCompanyId 比照 src/api/bff/screener/queryBuilder.ts 的既有慣例，
// 固定用合併報表('2')、母公司本身('')，不開放使用者選——BFF 面向的端點目前一律不曝露
// 這兩個內部細節維度。
export const getRoeHistory = async (symbol: string, basis: MetricBasis, limit: number): Promise<RoeHistoryEntry[]> => {
  const rows = await analysisPrisma.metricValue.findMany({
    where: { symbol, metricCode: 'roe', basis, dataType: '2', subsidiaryCompanyId: '' },
    orderBy: [{ fiscalYear: 'desc' }, { fiscalQuarter: 'desc' }, { knowledgeDate: 'desc' }],
  });

  // 已經依 knowledgeDate desc 排序，同一個 (fiscalYear, fiscalQuarter) 第一次出現的那筆
  // 就是目前市場最後所知的版本（見上方 §4.4 語義說明）。
  const latestPerPeriod = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.fiscalYear}-${row.fiscalQuarter}`;
    if (!latestPerPeriod.has(key)) latestPerPeriod.set(key, row);
  }

  return [...latestPerPeriod.values()]
    .slice(0, limit)
    .reverse() // 轉成由舊到新，方便前端直接畫時序圖
    .map((row) => ({
      fiscalYear: row.fiscalYear,
      fiscalQuarter: row.fiscalQuarter,
      value: row.value === null ? null : Number(row.value),
      nullReason: row.nullReason as RoeHistoryEntry['nullReason'],
      knowledgeDate: row.knowledgeDate.toISOString().slice(0, 10),
      knowledgeDateIsFallback: row.knowledgeDateIsFallback,
    }));
};
