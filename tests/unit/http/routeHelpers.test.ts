import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import type { Request, Response } from 'ultimate-express';
import { validate, VALIDATION_MESSAGES } from '@/http/middleware/validate';
import { handle, jsonRoute } from '@/http/route';
import { createErrorHandler } from '@/http/middleware/errorHandler';
import { NotFoundError, ValidationError } from '@/application/errors';

// Phase 4 薄 controller 的三個積木用假的 req/res 釘住行為：400 body 的訊息文字與 errors 形狀、驗證順序
// params → query → body、handle 的 200/錯誤轉交、errorHandler 對 AppError 與其他錯誤的兩種 body。
// 端到端（真的走 express）由 tests/contract/http/goldens.test.ts 的固定案例守著。
// 2026-10-08 錯誤改成 RFC 9457 problem+json（見 src/http/problem.ts）：sendProblem 走 type()＋send(JSON 字串)，這裡解析回物件比對。

interface FakeRes {
  statusCode: number;
  payload: unknown;
  headersSent: boolean;
  locals: Record<string, unknown>;
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
  send: (body: unknown) => FakeRes;
  type: (contentType: string) => FakeRes;
  getHeader: (name: string) => string | undefined;
  contentType?: string;
}

const fakeRes = (): FakeRes => {
  const res: FakeRes = {
    statusCode: 200,
    payload: undefined,
    headersSent: false,
    locals: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.payload = body;
      res.headersSent = true;
      return res;
    },
    send(body) {
      res.payload = typeof body === 'string' ? JSON.parse(body) : body;
      res.headersSent = true;
      return res;
    },
    type(contentType) {
      res.contentType = contentType;
      return res;
    },
    getHeader: (name) => (name === 'X-Request-Id' ? 'req-test-0001' : undefined),
  };
  return res;
};

const fakeReq = (parts: { params?: unknown; query?: unknown; body?: unknown }): Request => ({ params: {}, query: {}, body: undefined, ...parts }) as unknown as Request;

const run = async (middleware: (req: Request, res: Response, next: (err?: unknown) => void) => unknown, req: Request, res: FakeRes): Promise<{ nextCalled: boolean; nextError: unknown }> => {
  let nextCalled = false;
  let nextError: unknown;
  await middleware(req, res as unknown as Response, (err) => {
    nextCalled = true;
    nextError = err;
  });
  return { nextCalled, nextError };
};

describe('validate()', () => {
  const spec = { params: z.object({ symbol: z.string().min(1) }), query: z.object({ limit: z.coerce.number().int().min(1) }) };

  test('全部通過：驗證後的值放進 res.locals.validated，呼叫 next()', async () => {
    const res = fakeRes();
    const { nextCalled, nextError } = await run(validate(spec), fakeReq({ params: { symbol: '2330' }, query: { limit: '5' } }), res);
    expect(nextCalled).toBe(true);
    expect(nextError).toBeUndefined();
    expect(res.locals.validated).toEqual({ params: { symbol: '2330' }, query: { limit: 5 } });
  });

  test('params 先驗：params/query 同時錯時回的是 path parameters 的 400', async () => {
    const res = fakeRes();
    const { nextCalled } = await run(validate(spec), fakeReq({ params: { symbol: '' }, query: { limit: '0' } }), res);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.payload).toMatchObject({ status: 400, detail: VALIDATION_MESSAGES.params, errors: [{ parameter: 'symbol', detail: expect.any(String) }] });
  });

  test('query 錯 → 400 problem+json：errors 用 parameter 指名、沒有舊的頂層 message', async () => {
    const res = fakeRes();
    await run(validate(spec), fakeReq({ params: { symbol: '2330' }, query: { limit: '0' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.contentType).toBe('application/problem+json');
    expect(res.payload).toMatchObject({ type: 'about:blank', title: 'Bad Request', status: 400, detail: 'Invalid query parameters.', instance: 'urn:uuid:req-test-0001', errors: [{ parameter: 'limit' }] });
    expect(res.payload).not.toHaveProperty('message');
  });

  test('退役的查詢參數（periodType 等）→ 400 並指出新名稱，不是被默默忽略後回預設值', async () => {
    const res = fakeRes();
    const { nextCalled } = await run(validate(spec), fakeReq({ params: { symbol: '2330' }, query: { limit: '5', periodType: 'Q' } }), res);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.payload).toMatchObject({ detail: VALIDATION_MESSAGES.query, errors: [{ parameter: 'periodType', detail: 'periodType 已退役，改用 timeframe。' }] });
  });

  test('body 錯 → 400，errors 用 URI fragment 形式的 JSON Pointer（含 ~0／~1 跳脫）', async () => {
    const res = fakeRes();
    await run(validate({ body: z.object({ symbols: z.array(z.string()).min(1), 'a/b~c': z.string() }) }), fakeReq({ body: { symbols: [] } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.payload).toMatchObject({ detail: 'Invalid request body.', errors: [{ pointer: '#/symbols' }, { pointer: '#/a~1b~0c' }] });
  });
});

describe('handle() / jsonRoute()', () => {
  test('回傳值以 200 JSON 送出，輸入是 validate 放進 locals 的東西', async () => {
    const res = fakeRes();
    res.locals.validated = { params: { symbol: '2330' } };
    await run(
      handle<{ symbol: string }, unknown, unknown>(async ({ params }) => ({ symbol: params.symbol, ok: true })),
      fakeReq({}),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ symbol: '2330', ok: true });
  });

  test('handler 丟錯 → next(error)，不自己回應', async () => {
    const res = fakeRes();
    const error = new NotFoundError('找不到公司代號 9999。');
    const { nextCalled, nextError } = await run(
      handle(async () => {
        throw error;
      }),
      fakeReq({}),
      res
    );
    expect(nextCalled).toBe(true);
    expect(nextError).toBe(error);
    expect(res.headersSent).toBe(false);
  });

  test('jsonRoute = [validate, handle]：驗證失敗就不會執行 handler', async () => {
    let handlerRan = false;
    const [validateStep, handleStep] = jsonRoute({ query: z.object({ limit: z.coerce.number().min(1) }) }, async () => {
      handlerRan = true;
      return {};
    });
    const res = fakeRes();
    await run(validateStep!, fakeReq({ query: { limit: '0' } }), res);
    expect(res.statusCode).toBe(400);
    expect(handlerRan).toBe(false);
    expect(typeof handleStep).toBe('function');
  });
});

describe('createErrorHandler()', () => {
  test('AppError → 它自己的 status；有 problemCode 的帶 code 與 tag URI，沒有的是 about:blank', () => {
    const res = fakeRes();
    createErrorHandler({ isProduction: false })(new NotFoundError('查無公司代號 9999（上市、上櫃都沒有登記資料）。'), fakeReq({}), res as unknown as Response, () => {});
    expect(res.statusCode).toBe(404);
    expect(res.payload).toEqual({ type: 'about:blank', title: 'Not Found', status: 404, detail: '查無公司代號 9999（上市、上櫃都沒有登記資料）。', instance: 'urn:uuid:req-test-0001' });

    const res400 = fakeRes();
    createErrorHandler({ isProduction: true })(new ValidationError('"nope.TTM" 不是可查詢的欄位', 'unknown_metric'), fakeReq({}), res400 as unknown as Response, () => {});
    expect(res400.statusCode).toBe(400);
    expect(res400.payload).toMatchObject({ type: 'tag:oingg.com,2026:unknown-metric', status: 400, code: 'unknown_metric', detail: '"nope.TTM" 不是可查詢的欄位' });
  });

  test('其他錯誤：沒有 code；開發環境 detail 是原訊息，正式環境的 5xx 改固定文字；body 的 status 等於狀態碼', () => {
    const dev = fakeRes();
    createErrorHandler({ isProduction: false })(new Error('db exploded'), fakeReq({}), dev as unknown as Response, () => {});
    expect(dev.statusCode).toBe(500);
    expect(dev.payload).toMatchObject({ type: 'about:blank', title: 'Internal Server Error', status: 500, detail: 'db exploded' });
    expect(dev.payload).not.toHaveProperty('code');

    const prod = fakeRes();
    createErrorHandler({ isProduction: true })(new Error('db exploded'), fakeReq({}), prod as unknown as Response, () => {});
    expect(prod.payload).toMatchObject({ status: 500, detail: 'Something went wrong on the server.' });

    const withStatus = fakeRes();
    createErrorHandler({ isProduction: true })(Object.assign(new Error('bad input'), { status: 422 }), fakeReq({}), withStatus as unknown as Response, () => {});
    expect(withStatus.statusCode).toBe(422);
    expect(withStatus.payload).toMatchObject({ status: 422, title: 'Unprocessable Entity', detail: 'bad input' });
  });
});
