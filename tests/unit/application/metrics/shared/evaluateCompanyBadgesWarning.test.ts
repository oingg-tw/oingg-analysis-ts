import { describe, expect, test } from 'vitest';
import { evaluateCompanyBadges } from '@/application/metrics/shared/badges/evaluateCompanyBadges';
import type { MetricValueQueryPort, PeriodHistoryRow } from '@/application/ports/metricValueQueries';
import { createTestDeps } from '../../../../fakes/createTestDeps';

// 2026-09-20 threshold.warning（徽章的警示端）——用 piotroskiFScore（8+ 達成、≤2 警示、3–7 中間）釘住三段
// 語意跟 passed/warning 的互斥關係。只 seed piotroskiFScore 一支的 Q 列，其餘徽章讀到「查無此列」會被
// evaluateCompanyBadges 當作「不適用」整個略過（見該檔 isGenuinelyNotApplicable 的說明），所以結果裡
// 只會有這一支，斷言不會被別的徽章干擾。

const day = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

const queriesWithPiotroski = (
  score: number | null
): Pick<MetricValueQueryPort, 'listPeriodMetricHistoryRows' | 'listDailyCadenceMetricHistoryRows' | 'findLatestSnapshotValue' | 'companyRank'> => ({
  listPeriodMetricHistoryRows: async (_symbol, metricCode): Promise<PeriodHistoryRow[]> =>
    metricCode === 'piotroskiFScore'
      ? [{ fiscalYear: 2026, fiscalQuarter: 2, value: score, nullReason: score === null ? 'missing_input' : null, knowledgeDate: day('2026-08-11'), knowledgeDateIsFallback: false }]
      : [],
  listDailyCadenceMetricHistoryRows: async () => [], // EOD 型徽章（liveGrahamNumber/livePegRatio）走這條，回空＝不適用略過
  findLatestSnapshotValue: async () => null,
  companyRank: async () => [], // percentileRank 徽章（novyMarxGpToAssets）走這條，回空＝不適用略過
});

const piotroskiOf = async (score: number | null) => {
  const deps = createTestDeps({ metricValueQueries: queriesWithPiotroski(score) as MetricValueQueryPort });
  const categories = await evaluateCompanyBadges('2330', deps);
  const badge = categories.flatMap((c) => c.badges).find((b) => b.metricCode === 'piotroskiFScore');
  expect(badge, 'piotroskiFScore 徽章應該出現在結果裡').toBeDefined();
  return badge!;
};

describe('evaluateCompanyBadges 的 warning 端（piotroskiFScore）', () => {
  test('9 分：passed=true、warning=false', async () => {
    expect(await piotroskiOf(9)).toMatchObject({ value: 9, passed: true, warning: false });
  });

  test('8 分（門檻邊界）：passed=true、warning=false', async () => {
    expect(await piotroskiOf(8)).toMatchObject({ value: 8, passed: true, warning: false });
  });

  test('5 分（中間區）：passed=false、warning=false', async () => {
    expect(await piotroskiOf(5)).toMatchObject({ value: 5, passed: false, warning: false });
  });

  test('2 分（警示邊界）：passed=false、warning=true', async () => {
    expect(await piotroskiOf(2)).toMatchObject({ value: 2, passed: false, warning: true });
  });

  test('0 分：passed=false、warning=true', async () => {
    expect(await piotroskiOf(0)).toMatchObject({ value: 0, passed: false, warning: true });
  });

  test('算不出來（null）：passed 跟 warning 都是 null，不是「未達成」也不是「警示」', async () => {
    expect(await piotroskiOf(null)).toMatchObject({ value: null, passed: null, warning: null });
  });
});
