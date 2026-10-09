// 2026-09-17 clean architecture 重構 Phase 1：整個服務共用的錯誤分類。原本只有兩個空殼
// class（screener 的 ScreenerValidationError、etfScreener 的 EtfScreenerValidationError），
// 每個 controller 各自 instanceof 判斷後回 400，其餘錯誤一律 500 且把內部訊息原樣回給 client。
// 現在 use case 只要丟 AppError 的子類別，HTTP 層（Phase 4 的 errorHandler）就知道該回哪個
// 狀態碼；Error subclass 是這個 codebase 唯一允許用 class 的地方（要 stack trace + instanceof）。
//
// 訊息文字是對外契約的一部分（bff-ts 會把 400 的 message 直接顯示），改分類時訊息不能變。
// 2026-10-08 RFC 9457 problem+json（跟 bff-ts 同一套，見 http/problem.ts）：problemCode 只在呼叫端需要分支時才給
// （unknown_metric、unsupported_timeframe），對應 problem 的 code 與 type；其餘 400／404 看 status 就夠，不給。
// 訊息文字（problem 的 detail）只給人看，措辭可以改。
export type AppErrorCode = 'VALIDATION' | 'NOT_FOUND';
// 2026-10-10 業務中台要求加 per_share_not_aggregatable（類股中位數拒收每股類指標）、unknown_sector（查無類股的 404，跟「路由不存在」的 404 分開）。
export type AppProblemCode = 'unknown_metric' | 'unsupported_timeframe' | 'per_share_not_aggregatable' | 'unknown_sector';

export class AppError extends Error {
  readonly problemCode: AppProblemCode | undefined;

  constructor(
    readonly code: AppErrorCode,
    readonly status: number,
    message: string,
    options?: { cause?: unknown; problemCode?: AppProblemCode }
  ) {
    super(message, options);
    this.name = new.target.name;
    this.problemCode = options?.problemCode;
  }
}

// 請求內容不合法（欄位格式、不存在的 metricCode/timeframe、超過上限…）→ 400。
export class ValidationError extends AppError {
  constructor(message: string, problemCode?: AppProblemCode) {
    super('VALIDATION', 400, message, { problemCode });
  }
}

// 明確查無此資源（例如不存在的公司代號）→ 404。
export class NotFoundError extends AppError {
  constructor(message: string, problemCode?: AppProblemCode) {
    super('NOT_FOUND', 404, message, { problemCode });
  }
}

// 2026-09-17 Phase 6 死碼清理：原本還有 UpstreamDataError（503）的預留分類，沒有任何 use case 丟過，
// 已刪；真的需要時再加（errorHandler 對任何 AppError 子類別都是 res.status(err.status).json({ message })）。

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
