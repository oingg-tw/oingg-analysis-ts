// 2026-09-17 clean architecture 重構 Phase 1：整個服務共用的錯誤分類。原本只有兩個空殼
// class（screener 的 ScreenerValidationError、etfScreener 的 EtfScreenerValidationError），
// 每個 controller 各自 instanceof 判斷後回 400，其餘錯誤一律 500 且把內部訊息原樣回給 client。
// 現在 use case 只要丟 AppError 的子類別，HTTP 層（Phase 4 的 errorHandler）就知道該回哪個
// 狀態碼；Error subclass 是這個 codebase 唯一允許用 class 的地方（要 stack trace + instanceof）。
//
// 訊息文字是對外契約的一部分（bff-ts 會把 400 的 message 直接顯示），改分類時訊息不能變。
export type AppErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'UPSTREAM_UNAVAILABLE';

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly status: number,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

// 請求內容不合法（欄位格式、不存在的 metricCode/timeframe、超過上限…）→ 400。
export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION', 400, message);
  }
}

// 明確查無此資源（例如不存在的公司代號）→ 404。
export class NotFoundError extends AppError {
  constructor(message: string) {
    super('NOT_FOUND', 404, message);
  }
}

// 上游資料源（export DB、view 還沒開）暫時拿不到 → 503。
export class UpstreamDataError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('UPSTREAM_UNAVAILABLE', 503, message, options);
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
