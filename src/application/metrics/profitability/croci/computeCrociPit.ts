import { runLegacyPit } from '@/application/metrics/legacyBridge';
import { computeCroci } from './computeCroci';
import type { StandardBasisPitOutcome } from '@/application/metrics/pitOutcome';

// **暫時性 shim**（2026-09-17 Phase 3）：croci 的計算本體搬到 computeCroci.ts（純計算、deps 注入），這裡只保留舊名稱
// computeAndWriteCrociPit(query) 給 scripts/ 跟既有整合測試用，回傳形狀跟以前完全一樣（persistComputations 攤平後的結果）。
// Phase 3 收尾時 scripts 改 import bootstrap 綁定好的版本，這支檔案刪除。
export * from './computeCroci';

export type CrociPitOutcome = StandardBasisPitOutcome;

export const computeAndWriteCrociPit = runLegacyPit(computeCroci) as (query: Parameters<typeof computeCroci>[0]) => Promise<CrociPitOutcome>;
