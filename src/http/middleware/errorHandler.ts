import type { ErrorRequestHandler } from 'ultimate-express';
import { isAppError } from '@/application/errors';

// A simple interface for HTTP errors
interface HttpError extends Error {
  status?: number;
}

// 2026-09-17 clean architecture 重構 Phase 4：
// - AppError（application/errors.ts 的 ValidationError/NotFoundError/UpstreamDataError）依它自己的 status 回
//   `{ message }`——跟今天各 controller 手寫 res.status(404).json({ message }) 的 body 完全一樣，use case 只要丟錯。
// - 其餘錯誤維持今天的 `{ status, message }` 形狀；**唯一刻意的行為變更**：正式環境的 5xx 不再把內部錯誤訊息
//   原樣回給 client（改固定文字），開發環境不變。
// - 這裡是唯一的記錄點（pino-http 掛在 req.log 上），取代各 controller catch 裡各自 logger.error 再 next(error)。
//
// `_next` 沒有被呼叫，但不能拿掉——Express/ultimate-express 是用函式參數個數（4 個）判斷這是不是
// 錯誤處理中介層，拿掉會讓這支函式變成一般中介層，不再被當成錯誤處理器呼叫。
export const createErrorHandler =
  ({ isProduction }: { isProduction: boolean }): ErrorRequestHandler =>
  (err: HttpError, req, res, _next) => {
    if (isAppError(err)) {
      res.status(err.status).json({ message: err.message });
      return;
    }

    const status = err.status || 500;
    const message = err.message || 'Something went wrong on the server.';
    (req as unknown as { log?: { error: (obj: unknown, msg: string) => void } }).log?.error({ err }, 'request failed');
    res.status(status).send({ status, message: isProduction && status >= 500 ? 'Something went wrong on the server.' : message });
  };
