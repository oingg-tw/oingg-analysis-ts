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

// 2026-10-10 全生態系詞彙表（UBIQUITOUS_LANGUAGE.md 第五節）改名的並存期：程式內部已經改用新 key，回應另外補上舊 key（值相同），
// 照 docs/api-conventions.md 並存 14 天，RETIRED_RESPONSE_KEYS_REMOVED_ON 到期刪掉這張表與 withRetiredKeys 即可。
// 只放「新 key 全 API 只有一種意思」的改名（例：*Percent → *Pct）；新 key 在別的端點另有意思的（例：announcementDate），
// 不能放這裡，要在該端點自己處理，否則會在不相干的端點冒出舊 key。
export const RETIRED_RESPONSE_KEYS_REMOVED_ON = '2026-10-24';
const RETIRED_RESPONSE_KEYS: Record<string, string> = {
  yoyChangePct: 'yoyChangePercent',
  momChangePct: 'momChangePercent',
  cumulativeChangePct: 'cumulativeChangePercent',
  changePct: 'changePercent',
  sixDayChangePct: 'sixDayChangePercent',
  topPct: 'topPercent',
  sharesHeldPct: 'sharesHeldPercent',
  sharesChangePct: 'sharesChangePercent',
  foreignLimitPct: 'foreignLimitPercent',
  availableInvestPct: 'availableInvestPercent',
  pledgePct: 'pledgePercent',
  m1aYoyPct: 'm1aYoyPercent',
  m1bYoyPct: 'm1bYoyPercent',
  m2YoyPct: 'm2YoyPercent',
  avgTaiexYoyPct: 'avgTaiexYoyPercent',
  numberOfSharesIssued: 'paidInShares',
  order: 'direction', // GET /metrics 徽章 threshold.percentileRank 的排名方向（回應裡只有這一處叫 order）
};
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;
export const withRetiredKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withRetiredKeys);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = withRetiredKeys(v);
    const old = RETIRED_RESPONSE_KEYS[k];
    if (old !== undefined && !(old in value)) out[old] = out[k];
  }
  return out;
};

export const handle =
  <P = unknown, Q = unknown, B = unknown>(fn: RouteHandler<P, Q, B>): RequestHandler =>
  async (req, res, next) => {
    try {
      const body = await fn((res.locals.validated ?? {}) as ValidatedInput<P, Q, B>, req, res);
      if (!res.headersSent) res.status(200).json(withRetiredKeys(body));
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
