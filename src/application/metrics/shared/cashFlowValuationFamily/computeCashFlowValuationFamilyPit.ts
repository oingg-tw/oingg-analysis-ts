import { runLegacyPit } from '@/application/metrics/legacyBridge';
import { computeCashFlowValuationFamily } from './computeCashFlowValuationFamily';
import type { QuarterlyPitOutcomeBase, BasisOutcome } from '@/application/metrics/pitOutcome';

// **暫時性 shim**（2026-09-17 Phase 3）：cashFlowValuationFamily 的計算本體搬到 computeCashFlowValuationFamily.ts（純計算、deps 注入），這裡只保留舊名稱
// computeAndWriteCashFlowValuationFamilyPit(query) 給 scripts/ 跟既有整合測試用，回傳形狀跟以前完全一樣（persistComputations 攤平後的結果）。
// Phase 3 收尾時 scripts 改 import bootstrap 綁定好的版本，這支檔案刪除。
export * from './computeCashFlowValuationFamily';

export interface CashFlowValuationFamilyPitOutcome extends QuarterlyPitOutcomeBase {
  evToOcf: BasisOutcome;
  evToSales: BasisOutcome;
  priceToOcf: BasisOutcome;
  debtToFcf: BasisOutcome;
  capexToOcfRatio: BasisOutcome;
  croic: BasisOutcome;
  ocfMargin: BasisOutcome;
  fcfConversionRate: BasisOutcome;
}

export const computeAndWriteCashFlowValuationFamilyPit = runLegacyPit(computeCashFlowValuationFamily) as (query: Parameters<typeof computeCashFlowValuationFamily>[0]) => Promise<CashFlowValuationFamilyPitOutcome>;
