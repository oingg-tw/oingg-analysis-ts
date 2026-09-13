import { Prisma as MopsPrisma } from '#generated/mops-export-client';

// 2026-09-13 mops-ts 準備移除 capital_stock_history/preferred_stock_right 兩張表（含
// export view），查無官方替代資料源。這兩張表目前是直接 $queryRaw，沒有存在性檢查——
// 表被刪掉之後查詢會直接噴 Postgres「relation does not exist」，不是「查無資料」那種
// 正常的空結果。這支工具讓呼叫端可以把「表本身不存在」跟其他真正的查詢失敗分開處理，
// 優雅降級成空陣列/null（跟這批端點既有「查無資料是正常情境」的慣例一致），不要讓
// 整個請求變成未預期的 500。
//
// 實測過（scripts/tmpCheckPrismaErrorShape.ts，已刪除）Prisma 7 driver adapter 架構下
// 查詢不存在的表拋出的實際錯誤形狀：PrismaClientKnownRequestError，code='P2010'
// （"Raw query failed" 的通用碼，不是特定於某種底層錯誤），真正能分辨「表不存在」的
// 欄位是 error.meta.driverAdapterError.cause.kind === 'TableDoesNotExist'（連帶有
// originalCode='42P01'，但 kind 語意更明確，優先看這個）。這個巢狀結構是 @prisma/adapter-pg
// 包出來的，不是 Prisma 官方文件穩定承諾的公開型別，只用 unknown + 執行期屬性檢查，
// 不強行斷言完整型別。
//
// 只認 mops-export-client 的 PrismaClientKnownRequestError 類別——這兩張表都是
// mopsExportPrisma 查的，不需要處理其餘 5 個 Prisma client 各自的錯誤類別（雖然底層
// 都是同一個 @prisma/client 執行期，但 TypeScript 型別是各自 codegen 出來的獨立類別，
// instanceof 只認同一個 client 產生的類別）。
export const isUndefinedTableError = (error: unknown): boolean => {
  if (!(error instanceof MopsPrisma.PrismaClientKnownRequestError) || error.code !== 'P2010') return false;
  const driverAdapterError = (error.meta as Record<string, unknown> | undefined)?.driverAdapterError as Record<string, unknown> | undefined;
  const cause = driverAdapterError?.cause as Record<string, unknown> | undefined;
  return cause?.kind === 'TableDoesNotExist';
};
