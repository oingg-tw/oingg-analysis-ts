import { describe, expect, test } from 'vitest';
import { evaluateCompanyBadges } from '@/application/metrics/shared/badges/evaluateCompanyBadges';
import type { CompanyRankRow, MetricValueQueryPort, PeriodHistoryRow } from '@/application/ports/metricValueQueries';
import { createTestDeps } from '../../../../fakes/createTestDeps';

// 2026-09-21 threshold.percentileRank（跟同一批公司橫斷面排名比較，不是跟固定常數）——用
// novyMarxGpToAssetsBadge（scope: 'market'，direction: 'desc'，topPercent: 20）釘住主要行為：
// 分數/名次/母體總數怎麼換算成 percentile、topPercent 邊界怎麼判定 passed。
//
// scope: 'sector' 那條路徑（resolveCandidateSymbols 查公司自己的證交所類股、展開同類股成分股）
// 目前沒有真正掛在任何一支徽章上（novyMarxGpToAssetsBadge 依 Novy-Marx 論文原文用 market 排名），
// 等第一支真的用 sector 的徽章出現時，那支徽章自己的測試會覆蓋這條路徑——不提前測一段目前沒有
// 任何呼叫端會走到的分支。

const rankRow = (value: number, rank: number, totalCount: number): CompanyRankRow => ({ symbol: '2330', value, rank: BigInt(rank), quintile: 1n, total_count: BigInt(totalCount) });
const latestRow = (value: number | null, nullReason: string | null): PeriodHistoryRow => ({ fiscalYear: 2026, fiscalQuarter: 2, value, nullReason, knowledgeDate: new Date('2026-08-14'), knowledgeDateIsFallback: false });

// 2026-09-21 起 percentileRank 徽章跟一般徽章共用同一段「先查最新值」的路徑（web-nuxt 回報 bug 後合併）：
// latest 是 fetchLatestMetricValue 會看到的最新列（[] = 從未計算過），rows 是 companyRank 的排名結果。
const queriesWithGpToAssets = (latest: PeriodHistoryRow[], rows: CompanyRankRow[]): Pick<MetricValueQueryPort, 'listPeriodMetricHistoryRows' | 'listDailyCadenceMetricHistoryRows' | 'findLatestSnapshotValue' | 'companyRank'> => ({
  listPeriodMetricHistoryRows: async (_symbol, metricCode) => (metricCode === 'novyMarxGpToAssets' ? latest : []), // 其餘徽章回空＝從未計算過、略過，結果只會出現 novyMarxGpToAssets 一支
  listDailyCadenceMetricHistoryRows: async () => [],
  findLatestSnapshotValue: async () => null,
  companyRank: async (_symbol, field) => (field.metricCode === 'novyMarxGpToAssets' ? rows : []),
});

const gpToAssetsBadgeOf = async (rows: CompanyRankRow[], latest: PeriodHistoryRow[] = rows.map((r) => latestRow(r.value as number, null))) => {
  const deps = createTestDeps({ metricValueQueries: queriesWithGpToAssets(latest, rows) as MetricValueQueryPort });
  const categories = await evaluateCompanyBadges('2330', deps);
  return categories.flatMap((c) => c.badges).find((b) => b.metricCode === 'novyMarxGpToAssets');
};

describe('evaluateCompanyBadges 的 percentileRank（novyMarxGpToAssets，market 五分位）', () => {
  test('排第 1 名（100 家裡最高）：percentile=100、passed=true', async () => {
    const badge = await gpToAssetsBadgeOf([rankRow(45.2, 1, 100)]);
    expect(badge).toMatchObject({ value: 45.2, percentile: 100, rank: 1, totalCount: 100, passed: true });
  });

  test('剛好落在前 20% 邊界（第 20/100 名）：passed=true', async () => {
    const badge = await gpToAssetsBadgeOf([rankRow(30, 20, 100)]);
    expect(badge).toMatchObject({ rank: 20, totalCount: 100, passed: true });
  });

  test('剛好落在前 20% 邊界外（第 21/100 名）：passed=false', async () => {
    const badge = await gpToAssetsBadgeOf([rankRow(29, 21, 100)]);
    expect(badge).toMatchObject({ rank: 21, totalCount: 100, passed: false });
  });

  test('排最後一名（100/100）：percentile 接近 0、passed=false', async () => {
    const badge = await gpToAssetsBadgeOf([rankRow(-5, 100, 100)]);
    expect(badge!.percentile).toBeCloseTo(1, 5);
    expect(badge!.passed).toBe(false);
  });

  test('從未計算過（metric_values 沒有任何列）：這支徽章整個不出現在結果裡，跟一般徽章同規則', async () => {
    const badge = await gpToAssetsBadgeOf([], []);
    expect(badge).toBeUndefined();
  });

  // 2026-09-21 web-nuxt 回報：算不出來的公司上 percentileRank 徽章整筆缺席（徽章總數在公司間跳動 28/26/22），
  // 使用者要求不適用的徽章也要列——有列但 value null 時要照回 nullReason，percentile 三欄 null。
  test('這季算不出來（有列、value null、nullReason 是列舉值）：照回傳，passed/percentile/rank/totalCount 皆 null', async () => {
    const badge = await gpToAssetsBadgeOf([], [latestRow(null, 'insufficient_history')]);
    expect(badge).toMatchObject({ value: null, nullReason: 'insufficient_history', knowledgeDate: '2026-08-14', passed: null, percentile: null, rank: null, totalCount: null });
  });

  test('有值但不在排名母體裡（companyRank 回空）：value 照回，排名三欄與 passed 為 null', async () => {
    const badge = await gpToAssetsBadgeOf([], [latestRow(12.3, null)]);
    expect(badge).toMatchObject({ value: 12.3, nullReason: null, passed: null, percentile: null, rank: null, totalCount: null });
  });
});
