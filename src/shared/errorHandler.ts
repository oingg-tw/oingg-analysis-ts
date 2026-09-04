import { Request, Response, NextFunction } from 'ultimate-express';

// A simple interface for HTTP errors
interface HttpError extends Error {
  status?: number;
}

// `next` 沒有被呼叫，但不能拿掉——Express/ultimate-express 是用函式參數個數（4 個）判斷
// 這是不是錯誤處理中介層，拿掉 next 會讓這支函式變成一般中介層，不再被當成錯誤處理器呼叫。
const errorHandler = (err: HttpError, req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500;
  const message = err.message || 'Something went wrong on the server.';

  // In production, you might not want to send the detailed error message to the client
  res.status(status).send({ status, message });
};

export default errorHandler;
