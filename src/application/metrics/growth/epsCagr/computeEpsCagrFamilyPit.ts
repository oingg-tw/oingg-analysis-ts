import { runLegacyPitNested } from '@/application/metrics/legacyBridge';
import { computeEpsCagrFamily } from './computeEpsCagrFamily';
import type { QuarterlyPitOutcomeBase, BasisOutcome } from '@/application/metrics/pitOutcome';

// **暫時性 shim**（2026-09-17 Phase 3）：epsCagr 的計算本體搬到 computeEpsCagrFamily.ts（純計算、deps 注入），這裡只保留舊名稱
// computeAndWriteEpsCagrFamilyPit(query) 給 scripts/ 跟既有整合測試用，回傳形狀跟以前完全一樣（persistComputations 攤平後的結果）。
// Phase 3 收尾時 scripts 改 import bootstrap 綁定好的版本，這支檔案刪除。
export * from './computeEpsCagrFamily';

export interface EpsCagrFamilyPitOutcome extends QuarterlyPitOutcomeBase {
  results: Record<string, BasisOutcome>;
}

export const computeAndWriteEpsCagrFamilyPit = runLegacyPitNested(computeEpsCagrFamily, 'results') as unknown as (query: Parameters<typeof computeEpsCagrFamily>[0]) => Promise<EpsCagrFamilyPitOutcome>;
