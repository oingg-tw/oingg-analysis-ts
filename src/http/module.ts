import type { Router } from 'ultimate-express';
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

// 2026-09-17 clean architecture 重構 Phase 4：一個 HTTP 模組 = 一個 router + 它自己的 OpenAPI 註冊函式。
// 以前 src/http/routes.ts（掛載順序）跟 src/bootstrap/openapi.ts（文件註冊順序）是兩份要手動同步的清單，
// 新增路由要改兩個地方；現在 src/bootstrap/httpModules.ts 是唯一的有序清單，createApp 跟 buildOpenApiDocument
// 都吃同一份。
//
// auth 標籤取代「掛載在 bffAuth 之前/之後」這種靠順序表達的隱規則：
// - public：健康檢查，不需要密鑰（監控系統不該知道密鑰）。
// - batch：GCP Cloud Scheduler 用，刻意不套 BFF 共用密鑰（之後接 Cloud Run IAM，是不同的信任邊界；
//   2026-09-17 使用者拍板維持現狀不驗證）。
// - bff：只給 bff-ts 呼叫，套 X-Api-Key。
export interface HttpModule {
  name: string;
  auth: 'public' | 'batch' | 'bff';
  // 掛在某個路徑前綴底下（/valuation、/macro）；沒給就是掛在根。
  mountPath?: string;
  router: Router;
  registerOpenApi: (registry: OpenAPIRegistry) => void;
}
