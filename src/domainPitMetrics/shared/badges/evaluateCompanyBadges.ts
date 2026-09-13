import { scanMetricFolderCatalog } from '@/api/bff/metrics/metricFolderCatalog';
import { fetchLatestMetricValue } from '../fetchLatestMetricValue';
import type { MetricBadge } from '../../metricDefinitionSpec';
import type { MetricNullReason } from '../../metricBasis';

// 2026-09-13：GET /companies/:symbol/badges 的核心邏輯——使用者要求不要再讓前端自己拿
// GET /metrics 的 badge.threshold 去跟 metric-history 的數值土法煉鋼比較（web-nuxt 那邊
//已經證實這樣做會出錯：把不同性質的指標混在同一組計數、沒處理產業排除等 null 情境）。
// 後端統一算好 passed，前端只管呈現。
//
// 範圍只涵蓋 15 支「有 badge」的指標——沒有 badge 的其餘 79 支指標沒有「達成/未達成」
// 這個概念，不在這支端點的範圍內（那些指標的數值本身走既有的 metric-history/
// metrics-history 端點）。
//
// 財務韌性三模型（Z/M/O）聚合計數的正式規格（zone/calibrationStatus/industryNote，
// 見 oingg-conductor-ts 文件庫的《財務韌性三模型交叉驗證計算引擎》）還在跟文件維護方
// 對落差、細節未定案，這支端點目前只做「每支 badge 各自獨立判定 passed」的通用邏輯，
// 三模型聚合是後續獨立的擴充，不在這裡混著做。

export interface CompanyBadgeResult {
  metricCode: string;
  name: string;
  nameEn?: string;
  timeframe: string;
  value: number | null;
  nullReason: MetricNullReason | null;
  passed: boolean | null;
}

export interface CompanyBadgeCategory {
  categoryKey: string;
  categoryDisplayName: string;
  badges: CompanyBadgeResult[];
}

// 依 threshold 的比較詞彙判定是否達成。value 是這支指標自己的數值，compareValue 是
// compareAgainstFieldId 指向的另一支指標的數值（只有 comparator 搭配 compareAgainstFieldId
// 時才會用到，語意是「compareValue {comparator} value」，跟 metricDefinitionSpec.ts 的
// threshold.compareAgainstFieldId 說明一致，例如 NCAV 是「市值 < NCAV」）。
const evaluateComparator = (threshold: MetricBadge['threshold'], value: number, compareValue: number | null): boolean | null => {
  const { comparator } = threshold;
  if (threshold.compareAgainstFieldId) {
    if (compareValue === null) return null;
    switch (comparator) {
      case 'lt':
        return compareValue < value;
      case 'gt':
        return compareValue > value;
      case 'gte':
        return compareValue >= value;
      default:
        return null; // compareAgainstFieldId 目前只有 lt/gt 情境（NCAV 用 lt），其餘比較詞彙沒有實例
    }
  }
  switch (comparator) {
    case 'gt':
      return threshold.value !== undefined ? value > threshold.value : null;
    case 'gte':
      return threshold.value !== undefined ? value >= threshold.value : null;
    case 'lt':
      return threshold.value !== undefined ? value < threshold.value : null;
    case 'abs_lt':
      return threshold.value !== undefined ? Math.abs(value) < threshold.value : null;
    case 'in_range':
      return threshold.valueMin !== undefined && threshold.valueMax !== undefined ? value >= threshold.valueMin && value <= threshold.valueMax : null;
    default:
      return null; // allPositiveFieldIds 情境目前沒有任何 badge 在用（eps 的 badge 已移除），暫不實作
  }
};

export const evaluateCompanyBadges = async (symbol: string): Promise<CompanyBadgeCategory[]> => {
  const catalog = scanMetricFolderCatalog();

  const categories = await Promise.all(
    catalog.map(async ({ categoryKey, categoryDisplayName, metrics }) => {
      // piotroskiFScore 的 badge 沒有 timeframe/comparator（文件明講它的「N 選 M」門檻邏輯
      // 無法用這裡的通用比較詞彙表達，見 metricDefinitionSpec.ts 的 threshold 說明），硬塞
      // 進這支端點只會生出沒有意義的 timeframe:''/passed:null。它已經有專門的
      // GET /companies/piotroski-breakdown 端點處理真正的判定邏輯，這裡直接跳過。
      const badgeMetrics = metrics.filter((m) => m.badge && m.badge.timeframe !== undefined);
      const badges = await Promise.all(
        badgeMetrics.map(async (metric): Promise<CompanyBadgeResult> => {
          const badge = metric.badge!;
          const timeframe = badge.timeframe!; // 已在上面過濾掉 timeframe undefined 的 badge（目前只有 piotroskiFScore）
          const fetched = await fetchLatestMetricValue(symbol, metric.metricCode, timeframe);

          let compareValue: number | null = null;
          if (badge.threshold.compareAgainstFieldId) {
            const [compareMetricCode, compareTimeframe] = badge.threshold.compareAgainstFieldId.split('.');
            const compareFetched = await fetchLatestMetricValue(symbol, compareMetricCode!, compareTimeframe!);
            compareValue = compareFetched?.value ?? null;
          }

          const value = fetched?.value ?? null;
          const nullReason = fetched?.nullReason ?? null;
          const passed = value === null ? null : evaluateComparator(badge.threshold, value, compareValue);

          return { metricCode: metric.metricCode, name: badge.name, nameEn: badge.nameEn, timeframe, value, nullReason, passed };
        })
      );
      return { categoryKey, categoryDisplayName, badges };
    })
  );

  return categories.filter((category) => category.badges.length > 0);
};
