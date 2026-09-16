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
