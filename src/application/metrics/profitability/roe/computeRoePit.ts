import { runLegacyPit } from '../../legacyBridge';
import { computeRoe } from './computeRoe';
import type { StandardBasisPitOutcome } from '../../pitOutcome';

// **暫時性 shim**（2026-09-17 Phase 3 試點）：ROE 的計算本體搬到 computeRoe.ts（純計算、deps 注入），
// 這裡只保留舊名稱 computeAndWriteRoePit(query) 給 scripts/backfill*.ts 跟既有整合測試用，回傳形狀
// 跟以前完全一樣（persistComputations 攤平後的 { symbol, rocYear, season, q, ttm }）。Phase 3 收尾
// 時 scripts 改 import bootstrap 綁定好的版本，這支檔案刪除。
export type RoePitOutcome = StandardBasisPitOutcome;

export const computeAndWriteRoePit = runLegacyPit(computeRoe);
