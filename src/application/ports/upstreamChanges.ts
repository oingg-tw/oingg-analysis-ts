import type { UpstreamRowChange, UpstreamSource } from '@/domain/upstream/recomputeTargets';

// 2026-09-30 上游變動通知的待辦表（analysis DB 的 upstream_change_notices）與各家 export.row_changes 的讀取。
// 通知只帶「處理到第幾筆」，明細留在上游；我們依序處理、每個來源記到哪一筆做完。
export interface UpstreamChangeQueuePort {
  // upToId 比這個來源已收過的都大才入列，回傳新待辦的 id；小於或等於就回 null（冪等，重送、亂序都沒事）。
  enqueue(source: UpstreamSource, upToId: bigint, tables: string[]): Promise<bigint | null>;
  // 每個有待辦的來源：上次做完到哪（不含）、這次要做到哪（含）。
  listPendingRanges(): Promise<{ source: UpstreamSource; fromExclusive: bigint; toInclusive: bigint }[]>;
  // 把這個來源 <= toInclusive 的待辦標成做完／失敗，summary 是處理結果（筆數、認不得的表、失敗清單）給人看。
  complete(source: UpstreamSource, toInclusive: bigint, summary: Record<string, unknown>): Promise<void>;
  fail(source: UpstreamSource, toInclusive: bigint, error: string): Promise<void>;
  // 處理權租約：同一時間只讓一個處理程式跑（DB 併發不超過 8）。租約過期（處理程式死掉）後別人可以接手。
  acquireLease(holder: string, ttlMinutes: number): Promise<boolean>;
  releaseLease(holder: string): Promise<void>;
}

export interface UpstreamRowChangesPort {
  list(source: UpstreamSource, fromExclusive: bigint, toInclusive: bigint): Promise<UpstreamRowChange[]>;
}

// 入列之後叫醒處理程式（Cloud Run Job）。本機沒設 Job 名稱時不叫，由人手動跑處理腳本。
export interface UpstreamProcessorTriggerPort {
  trigger(): Promise<'triggered' | 'not_configured'>;
}
