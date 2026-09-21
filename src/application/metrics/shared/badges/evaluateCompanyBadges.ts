import { scanMetricFolderCatalog } from '@/application/metrics/metricFolderCatalog';
import { resolveTimeframeForMetric } from '@/application/metrics/resolveTimeframeForMetric';
import { fetchLatestMetricValue } from '../fetchLatestMetricValue';
import type { MetricHistoryDeps } from '../queryMetricHistory';
import type { AppDeps } from '@/application/deps';
import type { MetricBadge } from '../../../../domain/metrics/metricDefinitionSpec';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';

// 2026-09-13：GET /companies/:symbol/badges 的核心邏輯——使用者要求不要再讓前端自己拿
// GET /metrics 的 badge.threshold 去跟 metric-history 的數值土法煉鋼比較（web-nuxt 那邊
//已經證實這樣做會出錯：把不同性質的指標混在同一組計數、沒處理產業排除等 null 情境）。
// 後端統一算好 passed，前端只管呈現。
//
// 範圍只涵蓋 badgeRegistry.ts 有登錄的 metricCode（2026-09-14 前是內嵌在
// definition.badge，同日搬到獨立登錄檔，形狀不變）——沒有徽章的指標沒有「達成/未達成」
// 這個概念，不在這支端點的範圍內（那些指標的數值本身走既有的 metric-history/
// metrics-history 端點）。
//
// 財務韌性三模型（Z/M/O）聚合計數的正式規格（zone/calibrationStatus/industryNote，
// 見 oingg-conductor-ts 文件庫的《財務韌性三模型交叉驗證計算引擎》）還在跟文件維護方
// 對落差、細節未定案，這支端點目前只做「每支 badge 各自獨立判定 passed」的通用邏輯，
// 三模型聚合是後續獨立的擴充，不在這裡混著做。

export type EvaluateCompanyBadgesDeps = Pick<AppDeps, 'metricValueQueries' | 'industryReference' | 'companyProfiles'>;

export interface CompanyBadgeResult {
  metricCode: string;
  name: string;
  nameEn?: string;
  timeframe: string;
  value: number | null;
  nullReason: MetricNullReason | null;
  knowledgeDate: string | null;
  knowledgeDateIsFallback: boolean | null;
  passed: boolean | null;
  // 2026-09-20 新增：落在出處定義的「弱/警示」區。沒有定義 warning 門檻的徽章一律 null；value 為 null
  // 時也是 null。跟 passed 互斥（不會同時 true），見 metricDefinitionSpec.ts threshold.warning 的說明。
  warning: boolean | null;
  // 2026-09-21 新增：只有 threshold.percentileRank 的徽章才會填，其餘一律 null。percentile 是
  // 「贏過全市場/同類股百分之幾」（0-100，數字越大排名越前面，例如 95 代表贏過 95% 的同儕）；
  // rank/totalCount 是原始名次/母體總數，給前端想顯示「1,204 家裡排第 58 名」這種文案用，不用
  // 自己從 percentile 反推。sector 排名母體無法決定（公司沒有有效的證交所類股代碼）時三者皆 null，
  // 跟「這支指標本身算不出來」用同一套 null 語意，不特別區分。
  percentile: number | null;
  rank: number | null;
  totalCount: number | null;
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

// 警示區判定——只有單值比較，沒有 compareAgainstFieldId/in_range（目前沒有這種案例）。
const evaluateWarning = (warning: NonNullable<MetricBadge['threshold']['warning']>, value: number): boolean => {
  switch (warning.comparator) {
    case 'gt':
      return value > warning.value;
    case 'gte':
      return value >= warning.value;
    case 'lt':
      return value < warning.value;
    case 'lte':
      return value <= warning.value;
  }
};

// percentileRank 徽章的排名母體——market 回 null（companyRank 原生語意就是不限類股）；sector 查
// 公司自己的證交所類股代碼，代碼不存在/不合法（07/91/98/XX 這種「非產業」代碼、或這家公司從來沒有
// 類股資料）就回 undefined，呼叫端據此判斷「這家公司沒辦法做同類股排名」跟「查詢本身失敗」是同一種
// null 情境，不特別報錯。
const resolveCandidateSymbols = async (symbol: string, scope: 'market' | 'sector', deps: EvaluateCompanyBadgesDeps): Promise<string[] | null | undefined> => {
  if (scope === 'market') return null;
  const profile = await deps.companyProfiles.getCompanyProfileDetail(symbol);
  const sectorCode = profile?.industry ?? null;
  if (!sectorCode || !deps.industryReference.isValidSecuritiesSectorCode(sectorCode)) return undefined;
  const members = await deps.industryReference.listCompaniesBySectorCodes([sectorCode]);
  return [...members];
};

interface PercentileRankResult {
  value: number | null;
  percentile: number | null;
  rank: number | null;
  totalCount: number | null;
  passed: boolean | null;
}

const NULL_PERCENTILE_RESULT: PercentileRankResult = { value: null, percentile: null, rank: null, totalCount: null, passed: null };

const evaluatePercentileRank = async (
  symbol: string,
  metricCode: string,
  timeframe: string,
  percentileRank: NonNullable<MetricBadge['threshold']['percentileRank']>,
  deps: EvaluateCompanyBadgesDeps
): Promise<PercentileRankResult> => {
  const candidateSymbols = await resolveCandidateSymbols(symbol, percentileRank.scope, deps);
  if (candidateSymbols === undefined) return NULL_PERCENTILE_RESULT;

  const fieldRef = resolveTimeframeForMetric(metricCode, timeframe, `${metricCode}.${timeframe}`);
  const rows = await deps.metricValueQueries.companyRank(symbol, fieldRef, percentileRank.direction, percentileRank.excludeZero ?? false, candidateSymbols);
  const row = rows[0];
  if (!row) return NULL_PERCENTILE_RESULT;

  const rank = Number(row.rank);
  const totalCount = Number(row.total_count);
  const percentile = totalCount > 0 ? Math.round((1 - (rank - 1) / totalCount) * 1000) / 10 : null;
  const passed = percentile !== null ? rank / totalCount <= percentileRank.topPercent / 100 : null;

  return { value: typeof row.value === 'number' ? row.value : Number(row.value), percentile, rank, totalCount, passed };
};

export const evaluateCompanyBadges = async (symbol: string, deps: EvaluateCompanyBadgesDeps): Promise<CompanyBadgeCategory[]> => {
  const catalog = scanMetricFolderCatalog();
  const metricHistoryDeps: MetricHistoryDeps = deps;

  const categories = await Promise.all(
    catalog.map(async ({ categoryKey, categoryDisplayName, metrics }) => {
      // 防禦性過濾：沒有 timeframe 的 badge 不知道該讀哪個 basis 的值，硬塞進來只會生出沒有意義的
      // timeframe:''/passed:null。2026-09-19 起 badgeRegistry 裡每一支 badge 都有 timeframe（piotroskiFScore
      // 原本是唯一的例外——沒有門檻、由前端拆 3 個子徽章各自算——使用者決定合併回一個徽章、用論文的
      // 8 分門檻走這裡的通用判定），這個過濾目前不會濾掉任何東西，留著是擋未來漏填的情況。
      const badgeMetrics = metrics.filter((m) => m.badge && m.badge.timeframe !== undefined);
      const evaluated = await Promise.all(
        badgeMetrics.map(async (metric): Promise<CompanyBadgeResult | null> => {
          const badge = metric.badge!;
          const timeframe = badge.timeframe!; // 已在上面過濾掉 timeframe undefined 的 badge

          // percentileRank 是橫斷面比較，走獨立的一條路徑——companyRank 本身就會回傳這支指標的
          // 原始數值（row.value），不需要再另外呼叫 fetchLatestMetricValue 抓一次。
          if (badge.threshold.percentileRank) {
            const result = await evaluatePercentileRank(symbol, metric.metricCode, timeframe, badge.threshold.percentileRank, deps);
            if (result.value === null) return null; // 這家公司這支指標本身沒有值，或排名母體解析不出來——沒有意義的徽章列，跳過不回傳
            return {
              metricCode: metric.metricCode,
              name: badge.name,
              nameEn: badge.nameEn,
              timeframe,
              value: result.value,
              nullReason: null,
              knowledgeDate: null,
              knowledgeDateIsFallback: null,
              passed: result.passed,
              warning: null, // percentileRank 目前沒有 warning 端的案例，有再加
              percentile: result.percentile,
              rank: result.rank,
              totalCount: result.totalCount,
            };
          }

          const fetched = await fetchLatestMetricValue(symbol, metric.metricCode, timeframe, metricHistoryDeps);

          // 2026-09-15 使用者要求新增：像 bankCarRatio/bankCet1Ratio/bankTier1Ratio 這種
          // 只對特定產業（銀行/金控）有意義的指標，非銀行公司（例如台積電）從來不會有任何
          // metric_values 列（計算函式本身就跳過非銀行公司，不是這一季剛好算不出來）——
          // fetchLatestMetricValue 對「查無此列」跟「有列但這季算不出來」用同一個殼回傳
          // （value/nullReason 都是 null），差別在於「真的沒列」時 nullReason 是 JS 的
          // null（不是 MetricNullReason 列舉裡的任何一個值，那組列舉專門描述「有嘗試算但
          // 算不出來」的原因）。用這個差異判斷「這支徽章對這家公司根本不適用」就整個跳過
          // 不回傳，不要讓使用者看到一排全 null 的無意義徽章——跟「這季剛好算不出來但
          // 未來可能有」（nullReason 是列舉值之一）是不同情境，後者要維持顯示。
          const isGenuinelyNotApplicable = fetched !== null && fetched.value === null && fetched.nullReason === null;
          if (isGenuinelyNotApplicable) return null;

          let compareValue: number | null = null;
          if (badge.threshold.compareAgainstFieldId) {
            const [compareMetricCode, compareTimeframe] = badge.threshold.compareAgainstFieldId.split('.');
            const compareFetched = await fetchLatestMetricValue(symbol, compareMetricCode!, compareTimeframe!, metricHistoryDeps);
            compareValue = compareFetched?.value ?? null;
          }

          const value = fetched?.value ?? null;
          const nullReason = fetched?.nullReason ?? null;
          const passed = value === null ? null : evaluateComparator(badge.threshold, value, compareValue);
          const warning = value === null || !badge.threshold.warning ? null : evaluateWarning(badge.threshold.warning, value);

          return {
            metricCode: metric.metricCode,
            name: badge.name,
            nameEn: badge.nameEn,
            timeframe,
            value,
            nullReason,
            knowledgeDate: fetched?.knowledgeDate ?? null,
            knowledgeDateIsFallback: fetched?.knowledgeDateIsFallback ?? null,
            passed,
            warning,
            percentile: null,
            rank: null,
            totalCount: null,
          };
        })
      );
      const badges = evaluated.filter((b): b is CompanyBadgeResult => b !== null);
      return { categoryKey, categoryDisplayName, badges };
    })
  );

  return categories.filter((category) => category.badges.length > 0);
};
