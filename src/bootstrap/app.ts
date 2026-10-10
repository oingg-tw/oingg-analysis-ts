import express from 'ultimate-express';
import { randomUUID } from 'node:crypto';
import { sendProblem } from '@/http/problem';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import type { Logger } from 'pino';
import type { HttpModule } from '@/http/module';
import { createBusinessAuth } from '@/http/middleware/businessAuth';
import { createErrorHandler } from '@/http/middleware/errorHandler';
import { logger } from '@/infrastructure/logger';
import { config } from '@/infrastructure/config';
import { createHttpModules } from './httpModules';
import { appDeps } from './deps';
import { buildOpenApiDocument } from './openapi';

// 2026-09-17 clean architecture 重構：Phase 0 把「組 express app」從 src/index.ts 抽出來，跟「連 DB /
// 載快取 / listen」分開（HTTP 契約測試要一個不 listen、不連 DB 的 app）；Phase 4 改成從 HttpModule
// 清單組裝——middleware 鏈跟以前一模一樣，只是路由掛載不再靠 src/http/routes.ts 手寫順序，而是
// 依模組的 auth 標籤分組（public → batch → businessAuth → bff）。
export interface AppOptions {
  modules: readonly HttpModule[];
  logger: Logger;
  isProduction: boolean;
  businessApiKey: string | null | undefined;
  openApiDocument: object;
}

// 正式進場點跟契約測試都用這組預設值（config 已在 import 時驗證完環境變數）。
export const defaultAppOptions = (): AppOptions => {
  const modules = createHttpModules(appDeps);
  return {
    modules,
    logger,
    isProduction: config.isProduction,
    businessApiKey: config.businessApiKey,
    openApiDocument: buildOpenApiDocument(modules, { port: config.port }),
  };
};

export const createApp = (options: AppOptions = defaultAppOptions()) => {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging——2026-09-05 從 morgan 換成 pino-http：原本 morgan 只在開發模式開（正式環境
  // 完全沒有任何請求記錄），改用 pino-http 之後正式環境也會記錄，輸出結構化 JSON 讓 Cloud Run
  // 部署後可以直接用 Cloud Logging 依欄位查詢（例如篩某個 route 的 5xx），不用整段文字裡面找。
  //
  // customSuccessMessage 是必要的、不是美化：pino-http 預設判斷「completed」還是「aborted」
  // 靠 Node 原生的 req.readableAborted / res.writableEnded 這兩個屬性，但 ultimate-express
  // 是包 uWebSockets.js 的自訂 Request/Response（見 node_modules 原始碼確認過），從來不會設定
  // 這兩個屬性——結果是預設訊息**每一個成功的請求都會被標成「request aborted」**，log 等級/
  // 錯誤判斷（res.statusCode >= 500 那條路徑）本身沒受影響，只有這個文字判斷是錯的，但錯到會
  // 讓人誤判系統一直在出錯，一定要覆蓋掉。走到這個 callback 代表 pino-http 自己已經判定不是
  // 5xx/沒有 err（那條路走 customErrorMessage），直接回「request completed」就對了。
  // 2026-10-08 request id（RFC 9457 的 instance 用）：沿用 bff-ts 送來的 X-Request-Id（他們會把自己的 id 轉送過來，兩邊 log 對得起來），
  // 沒有就產生新的；同一個 id 寫回 X-Request-Id 回應 header、進 pino 的 log（req.id）、放進錯誤回應的 instance（見 http/problem.ts）。
  app.use(
    pinoHttp({
      logger: options.logger,
      customSuccessMessage: () => 'request completed',
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{8,128}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
    })
  );

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(options.openApiDocument as Parameters<typeof swaggerUi.setup>[0]));

  const mount = (module: HttpModule): void => {
    if (module.mountPath) app.use(module.mountPath, module.router);
    else app.use(module.router);
  };

  // 健康檢查給 Cloud Run/uptime 監控打，不能要求帶密鑰，否則監控系統也要知道這把密鑰。
  for (const module of options.modules.filter((m) => m.auth === 'public')) mount(module);
  // Batch 給 GCP Cloud Scheduler 用，不是 BFF——刻意不套 BFF 的共用密鑰（之後接 Cloud Run IAM invoker，
  // 是完全不同的信任邊界，不能共用同一把密鑰；2026-09-17 使用者拍板維持現狀）。
  for (const module of options.modules.filter((m) => m.auth === 'batch')) mount(module);
  // 上游變動通知：路由自己驗每個來源的 X-Upstream-Key（見 http/modules/upstream/route.ts），也不能套 bff 的密鑰。
  for (const module of options.modules.filter((m) => m.auth === 'upstream')) mount(module);
  // 以下都是只給 bff-ts 呼叫的模組，2026-09-05 起套用共用密鑰驗證。
  app.use(createBusinessAuth({ apiKey: options.businessApiKey }));
  // 2026-10-08 bff-ts 要在 CI 對我們的合約做 diff：OpenAPI 文件的 JSON 版（/api-docs 只有 Swagger 網頁介面），跟其他 bff 端點一樣要 X-Api-Key。
  app.get('/openapi.json', (_req, res) => {
    res.json(options.openApiDocument);
  });
  for (const module of options.modules.filter((m) => m.auth === 'bff')) mount(module);

  // 2026-10-08 沒有對應路由：回 RFC 9457 的 404（原本掉到框架預設的純文字頁）。掛在所有路由之後、錯誤處理之前。
  app.use((_req, res) => sendProblem(res, 404, 'No route matches this method and path.'));

  // 一定要是最後一個 middleware，才接得到前面所有路由丟出來的錯誤。
  app.use(createErrorHandler({ isProduction: options.isProduction }));

  return app;
};
