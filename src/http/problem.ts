import { STATUS_CODES } from 'node:http';
import type { Response } from 'ultimate-express';
import type { ZodError } from 'zod';

// 2026-10-08 RFC 9457 problem+json（跟 bff-ts／web-nuxt 一起定的 API 最佳實務）。形狀刻意跟 bff-ts 的 errorHandler 完全一致：
// 三個服務同一套成員名稱（oingg-conductor-ts「Architectural Guide to RFC 9457」的 Extension Key Inconsistency 反模式）。
// 所有錯誤回應都走這支：errorHandler、validate（zod）、bffAuth／upstream（401）、batch 的 rate limiter（429）、未知路由（404）。
// - type：有 code 的是 tag URI（tag:oingg.com,2026:unsupported-timeframe，§3.1.1 允許不可解析的 URI，type 與 code 一一對應）；
//   沒有 code 的是 about:blank（§4.2.1：錯誤的意思不超出 HTTP 狀態碼本身）。
// - code：只在呼叫端需要分支時才帶（unknown_metric、unsupported_timeframe）；400／401／404／429／500 本身的意思看 status 就夠。
// - title＝HTTP 狀態碼的標準短語；detail 只給人看，措辭可以改，不要解析。
// - instance＝urn:uuid:<request id>，沿用 bff 送來的 X-Request-Id（見 bootstrap/app.ts 的 pino-http genReqId），log 用同一個 id。
// - 驗證錯誤：errors: [{ detail, pointer }]（body，URI fragment 形式的 JSON Pointer，例如 #/columns/0/field）或
//   [{ detail, parameter }]（query／path 參數名稱）——RFC 9457 §3 自己範例的形狀（bff 一開始用的 invalid_params 是被取代的 7807 範例）。
// - 過渡期：舊的頂層 `message` 保留。驗證錯誤時它是「第一個欄位的錯誤訊息」——bff-ts 現在從舊 zod 樹挖出來顯示的就是這一句
//   （analysisServiceClient.readUpstreamValidationMessage，碰到陣列會退回讀 message），所以換格式後 bff 顯示的文字不變。
//   bff 改讀 errors／detail 後約定日期移除。
export type ProblemCode = 'unknown_metric' | 'unsupported_timeframe';

export type ProblemFieldError = { detail: string; pointer: string } | { detail: string; parameter: string };

export const toProblemErrors = (error: ZodError, part: 'path' | 'query' | 'body'): ProblemFieldError[] =>
  error.issues.map((issue) =>
    part === 'body'
      ? { detail: issue.message, pointer: `#${issue.path.map((p) => `/${String(p).replaceAll('~', '~0').replaceAll('/', '~1')}`).join('')}` }
      : { detail: issue.message, parameter: issue.path.map(String).join('.') }
  );

const requestIdOf = (res: Response): string => {
  const id = res.getHeader('X-Request-Id');
  return typeof id === 'string' ? id : 'unknown';
};

export const sendProblem = (res: Response, status: number, detail: string, options: { code?: ProblemCode; extensions?: Record<string, unknown> } = {}): void => {
  const { code, extensions = {} } = options;
  const problem = {
    message: detail, // 過渡期舊欄位，見檔頭；extensions 可以覆寫（驗證錯誤放第一個欄位的訊息）
    ...extensions,
    type: code ? `tag:oingg.com,2026:${code.replaceAll('_', '-')}` : 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    detail,
    instance: `urn:uuid:${requestIdOf(res)}`,
    ...(code ? { code } : {}),
  };
  res.status(status).type('application/problem+json').send(JSON.stringify(problem));
};
