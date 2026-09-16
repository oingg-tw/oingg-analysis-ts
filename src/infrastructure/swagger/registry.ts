import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

// 全服務共用的單一 registry——每個 api/bff 路由資料夾各自的 openapi.ts 在載入時（見
// src/adapters/swagger/index.ts 統一 import 並呼叫 registerXxxOpenApi()）把自己的路徑註冊
// 進來，取代原本 swagger-jsdoc 用 glob 掃 .ts 原始檔文字解析 JSDoc 註解的做法——那個做法
// 文件跟程式碼是兩份要手動保持同步的東西，這裡改成直接引用實際在用的 zod schema，改一個地方
// 兩邊（執行期驗證 + Swagger 文件）都會跟著更新。
export const registry = new OpenAPIRegistry();
