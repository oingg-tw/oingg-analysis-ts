import { readFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import type { PitDeps } from '@/application/metrics/deps';
import { persistComputations, type PersistedBatch } from '@/application/metrics/persistComputations';
import type { BasisOutcome } from '@/application/metrics/pitOutcome';
import type { ComputationSlot } from '@/domain/metrics/computation';
import type { LookbackRange, PeriodType, SamplingInterval, SnapshotCadence } from '@/domain/metrics/metricBasis';
import { createReplayPitDeps, type Cassette } from './cassette';
import { createInMemoryMetricValues, type StoredMetricRow } from './inMemoryMetricValues';

// 指標單元測試的固定骨架：cassette 回放的 deps + 記憶體 metricValues，run()/runNested() 跟
// src/bootstrap/pitMetrics.ts 的 runPit/runPitNested 一模一樣（只是 deps 換掉），findLatest/findMany/count
// 對應原本整合測試對 analysisPrisma.metricValue / metricDailyCadenceValue 的三種查詢（where 子集比對、
// knowledgeDate 降冪），讓 60 支既有測試的斷言可以逐字保留。

type Batch = { slots: Record<string, ComputationSlot> };

// 一列 = 座標欄位 + 寫入值，對齊 Prisma 的 metricValue / metricDailyCadenceValue 列形狀（兩張表的欄位聯集，
// 季報型列的 tradeDate 之類實際上是 undefined——測試只會對自己那張表的欄位做斷言，型別上放寬成都有）。
export interface StoredRowView {
  symbol: string;
  metricCode: string;
  dataType: string;
  subsidiaryCompanyId: string;
  periodType: PeriodType;
  fiscalYear: number;
  fiscalQuarter: number;
  lookbackRange: LookbackRange;
  samplingInterval: SamplingInterval;
  snapshotCadence: SnapshotCadence;
  tradeDate: Date;
  value: number | null;
  nullReason: string | null;
  knowledgeDate: Date;
  knowledgeDateIsFallback: boolean;
  formulaVersion: number;
}

// where 條件：跟 Prisma 一樣支援 `{ in: [...] }`，其餘是相等比對；只給的欄位才比（子集）。
export type RowWhere = Record<string, unknown>;

const matchesCondition = (actual: unknown, expected: unknown): boolean => {
  if (expected !== null && typeof expected === 'object' && !(expected instanceof Date) && 'in' in expected) {
    return ((expected as { in: unknown[] }).in).some((candidate) => sameValue(actual, candidate));
  }
  return sameValue(actual, expected);
};

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/pit');

export const loadCassette = (name: string): Cassette => JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8')) as Cassette;

const sameValue = (a: unknown, b: unknown): boolean => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

const toView = (row: StoredMetricRow): StoredRowView => ({ ...(row.where as unknown as Record<string, unknown>), ...row.values }) as unknown as StoredRowView;

export const createPitReplay = (cassetteName: string) => {
  const cassette = loadCassette(cassetteName);
  // 「現在」釘在錄製時刻（只假 Date，不動 setTimeout 之類）——有些 compute 用 new Date() 算 port 參數
  // （beta 的查詢起點等），時間不一致 cassette 的 key 就對不上；每個測試檔案是獨立的 worker，不會互相影響。
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(cassette.recordedAt) });
  const metricValues = createInMemoryMetricValues();
  const deps: PitDeps = createReplayPitDeps(cassette, { metricValues });

  const select = (where: RowWhere): StoredRowView[] =>
    metricValues
      .rows()
      .map(toView)
      .filter((row) => Object.entries(where).every(([key, value]) => matchesCondition((row as unknown as Record<string, unknown>)[key], value)))
      .sort((a, b) => b.knowledgeDate.getTime() - a.knowledgeDate.getTime());

  return {
    deps,
    metricValues,
    run:
      <Q, B extends Batch>(compute: (query: Q, deps: PitDeps) => Promise<B>) =>
      async (query: Q): Promise<PersistedBatch<B>> =>
        persistComputations(await compute(query, deps), deps),
    runNested:
      <Q, B extends Batch, N extends string>(compute: (query: Q, deps: PitDeps) => Promise<B>, nestUnder: N) =>
      async (query: Q): Promise<Omit<B, 'slots'> & Record<N, Record<keyof B['slots'], BasisOutcome>>> => {
        const batch = await compute(query, deps);
        const persisted = (await persistComputations(batch, deps)) as Record<string, unknown>;
        const { slots, ...context } = batch;
        const nested = Object.fromEntries(Object.keys(slots).map((key) => [key, persisted[key]]));
        return { ...context, [nestUnder]: nested } as Omit<B, 'slots'> & Record<N, Record<keyof B['slots'], BasisOutcome>>;
      },
    // = analysisPrisma.metricValue.findFirst({ where, orderBy: { knowledgeDate: 'desc' } })
    findLatest: async (where: RowWhere): Promise<StoredRowView | null> => select(where)[0] ?? null,
    // = analysisPrisma.metricValue.findMany({ where, orderBy: { knowledgeDate: 'desc' } })
    findMany: async (where: RowWhere): Promise<StoredRowView[]> => select(where),
    // = analysisPrisma.metricValue.count({ where })
    count: async (where: RowWhere): Promise<number> => select(where).length,
  };
};

