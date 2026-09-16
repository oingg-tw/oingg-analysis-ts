import { pitDeps } from '@/bootstrap/pitDeps';
import type { PitDeps } from './deps';
import type { ComputationSlot } from '@/domain/metrics/computation';
import { persistComputations, type PersistedBatch } from './persistComputations';

// **暫時性**檔案（Phase 3 逐 family 遷移期間用，全部遷完後刪除）：讓已經改成「純計算、回傳
// ComputationBatch」的 computeXxx 仍然能以舊名稱 computeAndWriteXxxPit(query) 從舊檔案位置被
// scripts/ 跟既有整合測試呼叫，回傳形狀也跟舊的一模一樣（persistComputations 攤平後就是）。
// 這是全 src/application 唯一一個 import bootstrap 的地方（dependency-cruiser 的
// application-only-domain 已知違規，收尾刪檔時歸零）——舊檔案位置的 shim 一律從這裡拿，不要
// 各自 import bootstrap。
export const legacyPitDeps: PitDeps = pitDeps;

export const runLegacyPit =
  <Q, B extends { slots: Record<string, ComputationSlot> }>(compute: (query: Q, deps: PitDeps) => Promise<B>) =>
  async (query: Q): Promise<PersistedBatch<B>> =>
    persistComputations(await compute(query, legacyPitDeps), legacyPitDeps);

// epsCagr/revenueCagr/dividendGrowthRate 三個「一個回溯窗口一個 metric_code」的 family，舊 outcome 把各窗口的
// 結果巢狀在 `results` 底下（`{ symbol, rocYear, season, results: { epsCagr3y, epsCagr5y, ... } }`），
// verifyMetricEquivalencePit 的 key 是 "results.epsCagr3y"——攤平後再包回去，舊形狀一個 byte 都不變。
export const runLegacyPitNested =
  <Q, B extends { slots: Record<string, ComputationSlot> }>(compute: (query: Q, deps: PitDeps) => Promise<B>, nestUnder: string) =>
  async (query: Q): Promise<Omit<B, 'slots'> & Record<string, unknown>> => {
    const batch = await compute(query, legacyPitDeps);
    const persisted = (await persistComputations(batch, legacyPitDeps)) as Record<string, unknown>;
    const { slots, ...context } = batch;
    const nested = Object.fromEntries(Object.keys(slots).map((key) => [key, persisted[key]]));
    return { ...context, [nestUnder]: nested } as Omit<B, 'slots'> & Record<string, unknown>;
  };
