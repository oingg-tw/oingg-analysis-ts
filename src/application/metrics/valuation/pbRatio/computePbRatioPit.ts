import { runLegacyPit } from '@/application/metrics/legacyBridge';
import { computePbRatio } from './computePbRatio';
import type { StandardBasisPitOutcome } from '@/application/metrics/pitOutcome';

// **暫時性 shim**（2026-09-17 Phase 3）：pbRatio 的計算本體搬到 computePbRatio.ts（純計算、deps 注入），這裡只保留舊名稱
// computeAndWritePbRatioPit(query) 給 scripts/ 跟既有整合測試用，回傳形狀跟以前完全一樣（persistComputations 攤平後的結果）。
// Phase 3 收尾時 scripts 改 import bootstrap 綁定好的版本，這支檔案刪除。
export * from './computePbRatio';

export type PbRatioPitOutcome = StandardBasisPitOutcome;

export const computeAndWritePbRatioPit = runLegacyPit(computePbRatio) as (query: Parameters<typeof computePbRatio>[0]) => Promise<PbRatioPitOutcome>;
