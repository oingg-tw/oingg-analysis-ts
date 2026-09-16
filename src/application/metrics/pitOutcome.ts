import type { MetricValueWriteOutcome } from '@/domain/metrics/coordinate';
import type { ComputationSkip } from '@/domain/metrics/computation';

// 87 支 compute*Pit.ts 的回傳型別（XxxPitOutcome）幾乎都是同一個形狀：symbol/rocYear/
// season 三個座標欄位 + 一組 basis 結果（q/ttm/fy 任意子集，每個 metric 只用到
// 其中幾個），2026-09-13 抽出共用。q/ttm/fy 故意都是選填——每支指標只回傳自己實際
// 算的那幾個 basis，不是每個 basis 都適用於每支指標（例如年度型指標只有 fy）。
// 2026-09-14 應使用者要求移除單季年化（Q_ANN）節省運算，原本的 qAnn 欄位一併移除。
// 2026-09-17 Phase 3：skip 的種類統一定義在 domain/metrics/computation.ts 的 ComputationSkip
// （多了逐日型指標用的 skipped_no_trade_date），persistComputations 攤平後的結果就是這個型別。
export type BasisOutcome = MetricValueWriteOutcome | ComputationSkip;

// 2026-09-17 Phase 3/6：原本還有 `QuarterlyPitOutcomeBase`（symbol/rocYear/season）跟
// `StandardBasisPitOutcome`（再加 q/ttm/fy 三個選填 basis）兩個 outcome 型別，bootstrap/pitMetrics.ts 的
// runPit/runPitNested 回傳精確的 PersistedBatch<...> 之後沒有消費端，已刪。
