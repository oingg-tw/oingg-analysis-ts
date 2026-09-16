import { runLegacyPit } from '@/application/metrics/legacyBridge';
import { computeBeta } from './computeBeta';
import type { BasisOutcome } from '@/application/metrics/pitOutcome';

// **暫時性 shim**（2026-09-17 Phase 3）：beta 的計算本體搬到 computeBeta.ts（純計算、deps 注入），這裡只保留舊名稱
// computeAndWriteBetaPit(query) 給 scripts/ 跟既有整合測試用，回傳形狀跟以前完全一樣（persistComputations 攤平後的結果）。
// Phase 3 收尾時 scripts 改 import bootstrap 綁定好的版本，這支檔案刪除。
export * from './computeBeta';

export interface BetaPitOutcome {
  symbol: string;
  tradeDate: string | null;
  beta1YDaily: BasisOutcome;
  beta2YWeekly: BasisOutcome;
  beta3YWeekly: BasisOutcome;
  beta5YMonthly: BasisOutcome;
}

export const computeAndWriteBetaPit = runLegacyPit(computeBeta) as (query: Parameters<typeof computeBeta>[0]) => Promise<BetaPitOutcome>;
