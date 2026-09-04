import { registerDailyBatchOpenApi } from './daily/openapi';
import { registerQuarterlyBatchOpenApi } from './quarterly/openapi';

// 2026-09-05 起薄殼合併層——實際的路徑註冊在 ./daily/openapi.ts、./quarterly/openapi.ts。
// src/adapters/swagger/index.ts 只認這個檔案，不用知道底下拆成兩個資料夾。
export const registerBatchOpenApi = (): void => {
  registerDailyBatchOpenApi();
  registerQuarterlyBatchOpenApi();
};
