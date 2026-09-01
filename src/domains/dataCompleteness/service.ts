import { indicatorJobs } from '@/shared/indicatorRegistry';
import type { CategoryCompleteness, DataCompletenessQuery, DataCompletenessResult, IndicatorAvailability } from './types';

// 直接呼叫全部 44 支 calculate*（跟 scripts/batchComputeIndicators.ts 共用同一份
// src/shared/indicatorRegistry.ts 登錄檔），用「這次呼叫有沒有 warnings」判斷這支指標對這家
// 公司來說完不完整——這是目前唯一一個所有指標都保證有的共同欄位（見 indicatorRegistry.ts
// 開頭說明：結構化的 fieldStatuses 目前只套用在約一半的指標，warnings 才是全部都有的）。
// 副作用：呼叫這支 API 會讓這 44 支指標各自把這家公司的結果 upsert 進自己的表，這是預期行為，
// 不是意外——跟本服務其他複合指標「呼叫時底層服務也會照常存檔」是同一種慣例。
export const calculateDataCompleteness = async (query: DataCompletenessQuery): Promise<DataCompletenessResult> => {
  const { companyId } = query;

  const settledResults = await Promise.allSettled(indicatorJobs.map((job) => job.run(companyId)));

  const categories: Record<string, CategoryCompleteness> = {};

  settledResults.forEach((settled, index) => {
    const job = indicatorJobs[index]!;

    let status: IndicatorAvailability;
    let warnings: string[];
    if (settled.status === 'rejected') {
      status = 'unavailable';
      warnings = [settled.reason instanceof Error ? settled.reason.message : String(settled.reason)];
    } else {
      warnings = settled.value.warnings;
      status = warnings.length === 0 ? 'ok' : 'partial';
    }

    const category = (categories[job.category] ??= { total: 0, ok: 0, partial: 0, unavailable: 0, completenessPct: 0, indicators: [] });
    category.total += 1;
    category[status] += 1;
    category.indicators.push({ key: job.name, status, warnings });
  });

  for (const category of Object.values(categories)) {
    category.completenessPct = Math.round((category.ok / category.total) * 100 * 100) / 100;
  }

  const totalIndicators = indicatorJobs.length;
  const totalOk = Object.values(categories).reduce((sum, category) => sum + category.ok, 0);

  return {
    companyId,
    totalIndicators,
    overallCompletenessPct: Math.round((totalOk / totalIndicators) * 100 * 100) / 100,
    categories,
  };
};
