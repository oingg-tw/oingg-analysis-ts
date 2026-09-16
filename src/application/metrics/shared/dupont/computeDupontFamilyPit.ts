import { runLegacyPit } from '@/application/metrics/legacyBridge';
import { computeDupontFamily } from './computeDupontFamily';
import type { QuarterlyPitOutcomeBase, BasisOutcome } from '@/application/metrics/pitOutcome';

// **暫時性 shim**（2026-09-17 Phase 3）：dupont 的計算本體搬到 computeDupontFamily.ts（純計算、deps 注入），這裡只保留舊名稱
// computeAndWriteDupontFamilyPit(query) 給 scripts/ 跟既有整合測試用，回傳形狀跟以前完全一樣（persistComputations 攤平後的結果）。
// Phase 3 收尾時 scripts 改 import bootstrap 綁定好的版本，這支檔案刪除。
export * from './computeDupontFamily';

export interface DupontFamilyPitOutcome extends QuarterlyPitOutcomeBase {
  netProfitMarginQ: BasisOutcome;
  netProfitMarginTtm: BasisOutcome;
  assetTurnoverQ: BasisOutcome;
  assetTurnoverTtm: BasisOutcome;
  equityMultiplier: BasisOutcome;
  dupontDecomposedRoeQ: BasisOutcome;
  dupontDecomposedRoeTtm: BasisOutcome;
  dupontTaxBurdenQ: BasisOutcome;
  dupontTaxBurdenTtm: BasisOutcome;
  dupontInterestBurdenQ: BasisOutcome;
  dupontInterestBurdenTtm: BasisOutcome;
  dupontEbitMarginQ: BasisOutcome;
  dupontEbitMarginTtm: BasisOutcome;
  dupontExtendedRoeQ: BasisOutcome;
  dupontExtendedRoeTtm: BasisOutcome;
}

export const computeAndWriteDupontFamilyPit = runLegacyPit(computeDupontFamily) as (query: Parameters<typeof computeDupontFamily>[0]) => Promise<DupontFamilyPitOutcome>;
