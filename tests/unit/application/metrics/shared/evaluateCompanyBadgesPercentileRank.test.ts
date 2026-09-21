import { describe, expect, test } from 'vitest';
import { evaluateCompanyBadges } from '@/application/metrics/shared/badges/evaluateCompanyBadges';
import type { CompanyRankRow, MetricValueQueryPort } from '@/application/ports/metricValueQueries';
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

const queriesWithGpToAssets = (rows: CompanyRankRow[]): Pick<MetricValueQueryPort, 'listPeriodMetricHistoryRows' | 'listDailyCadenceMetricHistoryRows' | 'findLatestSnapshotValue' | 'companyRank'> => ({
  listPeriodMetricHistoryRows: async () => [], // 其餘一般徽章走這條，回空＝不適用略過，結果只會出現 novyMarxGpToAssets 一支
  listDailyCadenceMetricHistoryRows: async () => [],
  findLatestSnapshotValue: async () => null,
  companyRank: async (_symbol, field) => (field.metricCode === 'novyMarxGpToAssets' ? rows : []),
});

const gpToAssetsBadgeOf = async (rows: CompanyRankRow[]) => {
  const deps = createTestDeps({ metricValueQueries: queriesWithGpToAssets(rows) as MetricValueQueryPort });
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

  test('companyRank 查無這家公司（value 本身算不出來）：這支徽章整個不出現在結果裡', async () => {
    const badge = await gpToAssetsBadgeOf([]);
    expect(badge).toBeUndefined();
  });
});
