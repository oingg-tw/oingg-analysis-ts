import { z } from 'zod';
import { getMetricHistory, metricHistoryEntrySchema } from './queryMetricHistory';
import type { PeriodType } from './metricBasis';

// 2026-09-07 使用者要「一次抓多個指標」（例如三率：grossMargin/operatingMargin/
// netProfitMargin），本來只有 dupont-history 這種為特定家族寫死欄位名稱的組合端點——
// 這支是泛化版：任意 metricCode 清單（同一個 basis），依 (fiscalYear,fiscalQuarter) 合併成
// 一列，用 metricCode 當 key，不是像 dupont-history 那樣寫死成具名欄位。適合「同一批
// point-in-time 指標，前端想畫在同一張圖表/同一張卡片」的情境；真正有語意組裝關係的家族
// （例如杜邦拆解需要標明「這是三因子的哪一個」）繼續用各自的組合端點，不用這支取代。

const multiMetricValueSchema = z
  .object({
    value: metricHistoryEntrySchema.shape.value,
    nullReason: metricHistoryEntrySchema.shape.nullReason,
    knowledgeDate: metricHistoryEntrySchema.shape.knowledgeDate,
    knowledgeDateIsFallback: metricHistoryEntrySchema.shape.knowledgeDateIsFallback,
  })
  .nullable()
  .meta({ description: '這個 metricCode 在這一期的值；null 代表這個 metricCode 在這一期完全沒有列（例如不同指標 backfill 範圍不同步）' });

export const multiMetricHistoryEntrySchema = z.object({
  fiscalYear: z.number().meta({ description: '西元年（民國+1911）' }),
  fiscalQuarter: z.number().nullable(),
  values: z.record(z.string(), multiMetricValueSchema).meta({ description: '以 metricCode 為 key，對照請求時的 metricCodes 清單' }),
});
export type MultiMetricHistoryEntry = z.infer<typeof multiMetricHistoryEntrySchema>;

export interface MultiMetricHistoryResult {
  entries: MultiMetricHistoryEntry[];
  // 取所有請求 metricCode 裡 total 最大的那個（涵蓋最完整的指標）——不同 metricCode 的
  // backfill 範圍不一定同步（例如三率的 netProfitMargin 曾經比 grossMargin 多補幾季），
  // 用最大值才不會低估「還有更多資料」這件事。
  total: number;
  hasMore: boolean;
}

const periodKey = (row: { fiscalYear: number; fiscalQuarter: number | null }): string => `${row.fiscalYear}-${row.fiscalQuarter}`;

// 2026-09-09：這支只支援季報型指標（periodType 單一參數，不是四欄位 basisGroup）——
// 逐日型指標（beta/exchangePeRatio 等）刻意不支援多指標一次查（controller.ts 偵測到
// 逐日型 metricCode 會直接 400），沒有實際情境需要把 beta 跟其他 metricCode 混在同一次
// 多指標查詢，見 abstract-crafting-journal.md 的拆表決策。
export const getMultiMetricHistory = async (
  symbol: string,
  metricCodes: string[],
  periodType: PeriodType,
  dataType: '1' | '2',
  subsidiaryCompanyId: string,
  limit: number
): Promise<MultiMetricHistoryResult> => {
  const results = await Promise.all(metricCodes.map((metricCode) => getMetricHistory(symbol, metricCode, periodType, dataType, subsidiaryCompanyId, limit)));

  const rowsByCodeByPeriod = metricCodes.map((_, i) => new Map(results[i]!.entries.map((row) => [periodKey(row), row])));

  const periods = new Map<string, { fiscalYear: number; fiscalQuarter: number | null }>();
  for (const result of results) {
    for (const row of result.entries) {
      periods.set(periodKey(row), { fiscalYear: row.fiscalYear, fiscalQuarter: row.fiscalQuarter });
    }
  }

  const sortedPeriods = [...periods.values()].sort((a, b) => a.fiscalYear - b.fiscalYear || (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0));
  const limitedPeriods = sortedPeriods.slice(-limit);

  const entries: MultiMetricHistoryEntry[] = limitedPeriods.map((period) => {
    const key = periodKey(period);
    const values: MultiMetricHistoryEntry['values'] = {};
    metricCodes.forEach((metricCode, i) => {
      const row = rowsByCodeByPeriod[i]!.get(key);
      values[metricCode] = row ? { value: row.value, nullReason: row.nullReason, knowledgeDate: row.knowledgeDate, knowledgeDateIsFallback: row.knowledgeDateIsFallback } : null;
    });
    return { fiscalYear: period.fiscalYear, fiscalQuarter: period.fiscalQuarter, values };
  });

  const total = Math.max(0, ...results.map((r) => r.total));
  return { entries, total, hasMore: total > entries.length };
};
