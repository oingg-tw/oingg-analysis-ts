import { scanMetricFolderCatalog } from '@/api/bff/metrics/metricFolderCatalog';
import { resolveTokenForMetric, ScreenerValidationError } from '@/api/bff/screener/fieldResolver';
import { getMetricHistory } from '../queryMetricHistory';
import { getDailyCadenceMetricHistory } from '../queryDailyCadenceMetricHistory';
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
  token: string;
  value: number | null;
  nullReason: MetricNullReason | null;
  passed: boolean | null;
}

export interface CompanyBadgeCategory {
  categoryKey: string;
  categoryDisplayName: string;
  badges: CompanyBadgeResult[];
}

const DATA_TYPE = '2'; // 既有 metric-history 端點的既定慣例：'2' = 合併口徑，不分子公司
const SUBSIDIARY_COMPANY_ID = '';

// 查一支 metricCode 在給定 token 下的最新一筆值——不管是季報型還是逐日型指標，呼叫端
// 不用自己判斷該查哪張表，跟既有 GET /companies/metric-history 同一套 resolveTokenForMetric
// + isDailyCadence 分流邏輯，避免兩處各自維護一份判斷。
const fetchLatestValue = async (symbol: string, metricCode: string, token: string): Promise<{ value: number | null; nullReason: MetricNullReason | null } | null> => {
  let fieldRef;
  try {
    fieldRef = resolveTokenForMetric(metricCode, token, `${metricCode}.${token}`);
  } catch (error) {
    if (error instanceof ScreenerValidationError) return null;
    throw error;
  }

  const result = fieldRef.isDailyCadence
    ? await getDailyCadenceMetricHistory(symbol, metricCode, { lookbackRange: fieldRef.lookbackRange, samplingInterval: fieldRef.samplingInterval, snapshotCadence: fieldRef.snapshotCadence }, DATA_TYPE, SUBSIDIARY_COMPANY_ID, 1)
    : await getMetricHistory(symbol, metricCode, fieldRef.periodType, DATA_TYPE, SUBSIDIARY_COMPANY_ID, 1);

  const latest = result.entries.at(-1);
  if (!latest) return { value: null, nullReason: null };
  return { value: latest.value, nullReason: latest.nullReason };
};

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
      // piotroskiFScore 的 badge 沒有 token/comparator（文件明講它的「N 選 M」門檻邏輯
      // 無法用這裡的通用比較詞彙表達，見 metricDefinitionSpec.ts 的 threshold 說明），硬塞
      // 進這支端點只會生出沒有意義的 token:''/passed:null。它已經有專門的
      // GET /companies/piotroski-breakdown 端點處理真正的判定邏輯，這裡直接跳過。
      const badgeMetrics = metrics.filter((m) => m.badge && m.badge.token !== undefined);
      const badges = await Promise.all(
        badgeMetrics.map(async (metric): Promise<CompanyBadgeResult> => {
          const badge = metric.badge!;
          const token = badge.token!; // 已在上面過濾掉 token undefined 的 badge（目前只有 piotroskiFScore）
          const fetched = await fetchLatestValue(symbol, metric.metricCode, token);

          let compareValue: number | null = null;
          if (badge.threshold.compareAgainstFieldId) {
            const [compareMetricCode, compareToken] = badge.threshold.compareAgainstFieldId.split('.');
            const compareFetched = await fetchLatestValue(symbol, compareMetricCode!, compareToken!);
            compareValue = compareFetched?.value ?? null;
          }

          const value = fetched?.value ?? null;
          const nullReason = fetched?.nullReason ?? null;
          const passed = value === null ? null : evaluateComparator(badge.threshold, value, compareValue);

          return { metricCode: metric.metricCode, name: badge.name, nameEn: badge.nameEn, token, value, nullReason, passed };
        })
      );
      return { categoryKey, categoryDisplayName, badges };
    })
  );

  return categories.filter((category) => category.badges.length > 0);
};
