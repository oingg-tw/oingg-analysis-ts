import type { AppDeps } from '@/application/deps';
import type { UpstreamSource } from '@/domain/upstream/recomputeTargets';

export type EnqueueUpstreamChangesDeps = Pick<AppDeps, 'upstreamQueue' | 'upstreamProcessor' | 'logger'>;

export interface EnqueueUpstreamChangesResult {
  queued: boolean; // false = upToId 沒有比已收過的大（重送或亂序），什麼都沒做
  queueId: string | null;
  processorTriggered: boolean;
}

// 2026-09-30 POST /upstream/changes 的 use case：入列，入列成功就叫醒處理程式。叫醒失敗不回錯給上游——待辦已經安全存下，
// 下一次通知會再叫一次；但要記 error，不能默默吞掉（使用者：現階段不能掩蓋正向流程的缺失）。
export const enqueueUpstreamChanges = async (
  input: { source: UpstreamSource; upToId: number; tables?: string[] },
  deps: EnqueueUpstreamChangesDeps
): Promise<EnqueueUpstreamChangesResult> => {
  const queueId = await deps.upstreamQueue.enqueue(input.source, BigInt(input.upToId), input.tables ?? []);
  if (queueId === null) return { queued: false, queueId: null, processorTriggered: false };

  let processorTriggered = false;
  try {
    processorTriggered = (await deps.upstreamProcessor.trigger()) === 'triggered';
  } catch (error) {
    deps.logger.error({ err: error, source: input.source, upToId: input.upToId }, '[upstream-changes] 已入列，但叫醒處理程式失敗');
  }
  return { queued: true, queueId: String(queueId), processorTriggered };
};
