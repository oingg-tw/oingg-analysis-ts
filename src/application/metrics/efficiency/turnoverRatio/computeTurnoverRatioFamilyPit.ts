import { runLegacyPit } from '@/application/metrics/legacyBridge';
import { computeTurnoverRatioFamily } from './computeTurnoverRatioFamily';
import type { QuarterlyPitOutcomeBase, BasisOutcome } from '@/application/metrics/pitOutcome';

// **暫時性 shim**（2026-09-17 Phase 3）：turnoverRatio 的計算本體搬到 computeTurnoverRatioFamily.ts（純計算、deps 注入），這裡只保留舊名稱
// computeAndWriteTurnoverRatioFamilyPit(query) 給 scripts/ 跟既有整合測試用，回傳形狀跟以前完全一樣（persistComputations 攤平後的結果）。
// Phase 3 收尾時 scripts 改 import bootstrap 綁定好的版本，這支檔案刪除。
export * from './computeTurnoverRatioFamily';

export interface TurnoverRatioFamilyPitOutcome extends QuarterlyPitOutcomeBase {
  inventoryTurnoverQ: BasisOutcome;
  inventoryTurnoverTtm: BasisOutcome;
  receivablesTurnoverQ: BasisOutcome;
  receivablesTurnoverTtm: BasisOutcome;
  fixedAssetTurnoverQ: BasisOutcome;
  fixedAssetTurnoverTtm: BasisOutcome;
  payablesTurnoverQ: BasisOutcome;
  payablesTurnoverTtm: BasisOutcome;
  inventoryDaysTtm: BasisOutcome;
  receivablesDaysTtm: BasisOutcome;
  payablesDaysTtm: BasisOutcome;
  cashConversionCycleTtm: BasisOutcome;
  operatingCycleTtm: BasisOutcome;
  netWorkingCapitalTurnoverTtm: BasisOutcome;
  inventoryToRevenueRatioTtm: BasisOutcome;
  receivablesToRevenueRatioTtm: BasisOutcome;
}

export const computeAndWriteTurnoverRatioFamilyPit = runLegacyPit(computeTurnoverRatioFamily) as (query: Parameters<typeof computeTurnoverRatioFamily>[0]) => Promise<TurnoverRatioFamilyPitOutcome>;
