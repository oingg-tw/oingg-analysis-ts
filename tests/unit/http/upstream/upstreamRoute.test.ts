import { describe, expect, test } from 'vitest';
import type { Request, Response } from 'ultimate-express';
import { createUpstreamChangesHandler } from '@/http/modules/upstream/route';
import { upstreamChangesBodySchema } from '@/http/modules/upstream/schemas';
import type { EnqueueUpstreamChangesDeps } from '@/application/upstream/enqueueUpstreamChanges';
import { silentLogger } from '../../../fakes/createTestDeps';

// POST /upstream/changes：釘住安全與冪等——金鑰依 body 的 source 比對（mops 的金鑰不能冒充 tpex）、沒設金鑰的來源在正式環境
// 一律拒絕、upToId 沒變大回 200 且不叫醒處理程式、叫醒失敗仍回 202（待辦已存下）但要記錯誤。用假 req/res 直接打 handler
// （見 route.ts 為什麼不用 supertest 起極簡 app）。
const keys = { mops: 'mops-key', tpex: 'tpex-key', twse: null };

const setup = (options: { isProduction?: boolean; enqueueResult?: bigint | null; triggerFails?: boolean } = {}) => {
  const errors: unknown[] = [];
  let triggerCalls = 0;
  const deps: EnqueueUpstreamChangesDeps = {
    logger: { ...silentLogger, error: (obj: unknown) => void errors.push(obj) },
    upstreamQueue: {
      enqueue: async () => (options.enqueueResult === undefined ? 42n : options.enqueueResult),
      listPendingRanges: async () => [],
      complete: async () => {},
      fail: async () => {},
      acquireLease: async () => true,
      releaseLease: async () => {},
    },
    upstreamProcessor: {
      trigger: async () => {
        triggerCalls += 1;
        if (options.triggerFails) throw new Error('403');
        return 'triggered';
      },
    },
  };
  const handler = createUpstreamChangesHandler(deps, { keys, isProduction: options.isProduction ?? true });
  const call = async (body: { source: 'mops' | 'tpex' | 'twse'; upToId: number }, key?: string) => {
    const res = { statusCode: 200, payload: undefined as unknown, status(c: number) { res.statusCode = c; return res; }, json(b: unknown) { res.payload = b; return res; }, send(b: string) { res.payload = JSON.parse(b); return res; }, type() { return res; }, getHeader: () => undefined };
    const req = { headers: key === undefined ? {} : { 'x-upstream-key': key } } as unknown as Request;
    await handler({ params: undefined, query: undefined, body }, req, res as unknown as Response);
    return res;
  };
  return { call, errors, triggerCalls: () => triggerCalls };
};

describe('POST /upstream/changes handler', () => {
  test('對的來源金鑰 → 202 入列並叫醒處理程式', async () => {
    const { call, triggerCalls } = setup();
    const res = await call({ source: 'tpex', upToId: 889 }, 'tpex-key');
    expect(res.statusCode).toBe(202);
    expect(res.payload).toEqual({ queued: true, queueId: '42', processorTriggered: true });
    expect(triggerCalls()).toBe(1);
  });

  test('拿 mops 的金鑰冒充 tpex → 401；沒帶金鑰 → 401；沒設金鑰的來源（twse）在正式環境一律 401', async () => {
    const { call, triggerCalls } = setup();
    expect((await call({ source: 'tpex', upToId: 1 }, 'mops-key')).statusCode).toBe(401);
    expect((await call({ source: 'mops', upToId: 1 })).statusCode).toBe(401);
    expect((await call({ source: 'twse', upToId: 1 }, 'anything')).statusCode).toBe(401);
    expect(triggerCalls()).toBe(0);
  });

  test('不是正式環境，但有設任何一把金鑰 → 一樣要驗（只有一把都沒設的本機才放行）', async () => {
    const { call } = setup({ isProduction: false });
    expect((await call({ source: 'mops', upToId: 1 })).statusCode).toBe(401);
  });

  test('upToId 沒有變大 → 200 queued=false，不叫醒', async () => {
    const { call, triggerCalls } = setup({ enqueueResult: null });
    const res = await call({ source: 'mops', upToId: 5 }, 'mops-key');
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ queued: false, queueId: null, processorTriggered: false });
    expect(triggerCalls()).toBe(0);
  });

  test('叫醒失敗仍回 202（待辦已存下），但錯誤要記下來', async () => {
    const { call, errors } = setup({ triggerFails: true });
    const res = await call({ source: 'mops', upToId: 7 }, 'mops-key');
    expect(res.statusCode).toBe(202);
    expect((res.payload as { processorTriggered: boolean }).processorTriggered).toBe(false);
    expect(errors).toHaveLength(1);
  });

  test('body 形狀：來源只能是三家、upToId 不能是負數或小數', () => {
    expect(upstreamChangesBodySchema.safeParse({ source: 'sitca', upToId: 1 }).success).toBe(false);
    expect(upstreamChangesBodySchema.safeParse({ source: 'mops', upToId: -1 }).success).toBe(false);
    expect(upstreamChangesBodySchema.safeParse({ source: 'mops', upToId: 1.5 }).success).toBe(false);
    expect(upstreamChangesBodySchema.safeParse({ source: 'mops', upToId: 0, tables: ['a'] }).success).toBe(true);
  });
});
