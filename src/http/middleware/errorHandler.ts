import type { ErrorRequestHandler } from 'ultimate-express';
import { isAppError } from '@/application/errors';
import { sendProblem } from '@/http/problem';

// A simple interface for HTTP errors
interface HttpError extends Error {
  status?: number;
}

// 2026-09-17 clean architecture 重構 Phase 4：use case 只要丟 AppError（application/errors.ts），這裡依它的 status 回應；
// 這裡是唯一的記錄點（pino-http 掛在 req.log 上），取代各 controller catch 裡各自 logger.error 再 next(error)。
// 2026-10-08 改成 RFC 9457 problem+json（見 http/problem.ts）：AppError 有 problemCode 的帶 code；其他錯誤沒有 code，
// 正式環境的 5xx 不回內部訊息（固定文字），stack 只進 log、用 instance（request id）對應。
//
// `_next` 沒有被呼叫，但不能拿掉——Express/ultimate-express 是用函式參數個數（4 個）判斷這是不是
// 錯誤處理中介層，拿掉會讓這支函式變成一般中介層，不再被當成錯誤處理器呼叫。
export const createErrorHandler =
  ({ isProduction }: { isProduction: boolean }): ErrorRequestHandler =>
  (err: HttpError, req, res, _next) => {
    if (isAppError(err)) {
      sendProblem(res, err.status, err.message, { code: err.problemCode });
      return;
    }

    const status = err.status || 500;
    (req as unknown as { log?: { error: (obj: unknown, msg: string) => void } }).log?.error({ err }, 'request failed');
    const detail = isProduction && status >= 500 ? 'Something went wrong on the server.' : err.message || 'Something went wrong on the server.';
    sendProblem(res, status, detail);
  };
