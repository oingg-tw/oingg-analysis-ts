import type { RequestHandler } from 'ultimate-express';
import type { ZodType } from 'zod';
import { sendProblem, toProblemErrors } from '@/http/problem';

// 2026-09-17 clean architecture 重構 Phase 4：取代 24 個 controller 裡 45 次複製貼上的
// `schema.safeParse(req.xxx)` + `res.status(400).json({ message: '…', errors: result.error.format() })`。
// 三段訊息文字跟 `errors: error.format()` 的形狀是對外契約（tests/contract/http/goldens.test.ts 釘住），
// zod 4 雖然把 .format() 標成 deprecated，改它就是契約變更，不在這次重構範圍。
// 驗證順序固定 params → query → body，跟既有 controller 一致（有 params 的端點都先驗 params）。
// 驗證過的值放在 res.locals.validated，由 route.ts 的 handle() 交給 use case。
// 2026-10-08 改成 RFC 9457 problem+json（見 http/problem.ts）：errors 列出這一段的全部欄位錯誤（body 用 pointer、query／path 用 parameter）；
// 舊的 zod .format() 樹拿掉（名稱跟 RFC 的 errors 衝突），過渡期的頂層 message 改成第一個欄位的訊息，bff 顯示的文字不變。

export interface ValidationSpec {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

export const VALIDATION_MESSAGES = {
  params: 'Invalid path parameters.',
  query: 'Invalid query parameters.',
  body: 'Invalid request body.',
} as const;

const PARTS = ['params', 'query', 'body'] as const;

export const validate =
  (spec: ValidationSpec): RequestHandler =>
  (req, res, next) => {
    const validated: Record<string, unknown> = {};
    for (const part of PARTS) {
      const schema = spec[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        sendProblem(res, 400, VALIDATION_MESSAGES[part], {
          extensions: { errors: toProblemErrors(result.error, part === 'params' ? 'path' : part), message: result.error.issues[0]?.message ?? VALIDATION_MESSAGES[part] },
        });
        return;
      }
      validated[part] = result.data;
    }
    res.locals.validated = validated;
    next();
  };
