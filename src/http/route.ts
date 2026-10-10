import type { Request, RequestHandler, Response } from 'ultimate-express';
import type { ZodType } from 'zod';
import { validate } from './middleware/validate';

// 2026-09-17 clean architecture 重構 Phase 4：薄 controller 的兩個積木。
// - handle(fn)：fn 收 validate() 放進 res.locals.validated 的已驗證輸入，回傳值以 200 JSON 送出；丟出的
//   錯誤交給 errorHandler（AppError 依它的 status/message 回應——404「查無…」、服務層 400 這類今天各 controller
//   手寫 res.status(...).json({ message }) 的情境，改成在 use case 丟 NotFoundError/ValidationError，body 一樣是
//   `{ message }`）。fn 自己已經回應過（res.headersSent）就不再送。
// - jsonRoute(spec, fn)：validate + handle 一次組好，route.ts 一行一個端點。
export interface ValidatedInput<P, Q, B> {
  params: P;
  query: Q;
  body: B;
}

export type RouteHandler<P, Q, B> = (input: ValidatedInput<P, Q, B>, req: Request, res: Response) => Promise<unknown>;

export const handle =
  <P = unknown, Q = unknown, B = unknown>(fn: RouteHandler<P, Q, B>): RequestHandler =>
  async (req, res, next) => {
    try {
      const body = await fn((res.locals.validated ?? {}) as ValidatedInput<P, Q, B>, req, res);
      if (!res.headersSent) res.status(200).json(body);
    } catch (error) {
      next(error);
    }
  };

export interface RouteSpec<P, Q, B> {
  params?: ZodType<P>;
  query?: ZodType<Q>;
  body?: ZodType<B>;
}

export const jsonRoute = <P = unknown, Q = unknown, B = unknown>(spec: RouteSpec<P, Q, B>, fn: RouteHandler<P, Q, B>): RequestHandler[] => [
  validate(spec),
  handle(fn),
];
