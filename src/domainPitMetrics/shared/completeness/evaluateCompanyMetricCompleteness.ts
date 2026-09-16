import { scanMetricFolderCatalog } from '@/http/modules/metrics/metricFolderCatalog';
import { fetchLatestMetricValue } from '../fetchLatestMetricValue';
import type { MetricNullReason } from '../../metricBasis';

// 2026-09-13 使用者問「有機制可以掃描每間公司的指標完整度嗎」——當時沒有，只有
// evaluateCompanyBadges.ts（只查 15 支「有 badge」的指標）跟 completenessCheck.ts（批次
// 執行層級的攻打數 vs 寫入數，不是單一公司視角）。這支是第三種視角：對「這家公司」掃過
// GET /metrics 全部指標（不限有 badge 的），各自查一筆代表性 timeframe 的最新值，回傳
// hasValue/nullReason，讓「這家公司哪些指標實際有算出數字、哪些卡在什麼原因」一次看完。
//
// 代表性 timeframe 的選法：優先選 TTM（季報型指標最常見、最少受單季雜訊干擾的口徑），
// 其次退回 validTimeframes 的第一個——同一 metricCode 底下不同 timeframe 通常是同一份底層資料的
// 不同聚合方式，會不會有值高度相關，不需要對每個 metricCode 掃全部 timeframe 組合（那是
// GET /companies/metric-history 自己的事，這裡只要「有沒有算出來過」這個訊號）。
const pickRepresentativeTimeframe = (validTimeframes: string[]): string | undefined => (validTimeframes.includes('TTM') ? 'TTM' : validTimeframes[0]);

export interface CompanyMetricCompletenessEntry {
  metricCode: string;
  name: string;
  nameEn?: string;
  timeframe: string | null; // null 代表這支 metricCode 沒有任何可用 timeframe（目前沒有已知案例，防呆）
  hasValue: boolean;
  nullReason: MetricNullReason | null;
}

export interface CompanyMetricCompletenessCategory {
  categoryKey: string;
  categoryDisplayName: string;
  metrics: CompanyMetricCompletenessEntry[];
  coveredCount: number; // 這個分類裡 hasValue 為 true 的指標數
  totalCount: number; // 這個分類的指標總數
}

export const evaluateCompanyMetricCompleteness = async (symbol: string): Promise<CompanyMetricCompletenessCategory[]> => {
  const catalog = scanMetricFolderCatalog();

  return Promise.all(
    catalog.map(async ({ categoryKey, categoryDisplayName, metrics }) => {
      const entries = await Promise.all(
        metrics.map(async (metric): Promise<CompanyMetricCompletenessEntry> => {
          const timeframe = pickRepresentativeTimeframe(metric.validTimeframes);
          if (!timeframe) {
            return { metricCode: metric.metricCode, name: metric.name, nameEn: metric.nameEn, timeframe: null, hasValue: false, nullReason: null };
          }

          const fetched = await fetchLatestMetricValue(symbol, metric.metricCode, timeframe);
          return {
            metricCode: metric.metricCode,
            name: metric.name,
            nameEn: metric.nameEn,
            timeframe,
            hasValue: fetched?.value !== null && fetched?.value !== undefined,
            nullReason: fetched?.nullReason ?? null,
          };
        })
      );

      return {
        categoryKey,
        categoryDisplayName,
        metrics: entries,
        coveredCount: entries.filter((entry) => entry.hasValue).length,
        totalCount: entries.length,
      };
    })
  );
};
