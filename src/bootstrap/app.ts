import express from 'ultimate-express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import type { Logger } from 'pino';
import type { HttpModule } from '@/http/module';
import { createBffAuth } from '@/http/middleware/bffAuth';
import { createErrorHandler } from '@/http/middleware/errorHandler';
import { logger } from '@/infrastructure/logger';
import { config } from '@/infrastructure/config';
import { createHttpModules } from './httpModules';
import { appDeps } from './deps';
import { buildOpenApiDocument } from './openapi';

// 2026-09-17 clean architecture 重構：Phase 0 把「組 express app」從 src/index.ts 抽出來，跟「連 DB /
// 載快取 / listen」分開（HTTP 契約測試要一個不 listen、不連 DB 的 app）；Phase 4 改成從 HttpModule
// 清單組裝——middleware 鏈跟以前一模一樣，只是路由掛載不再靠 src/http/routes.ts 手寫順序，而是
// 依模組的 auth 標籤分組（public → batch → bffAuth → bff）。
export interface AppOptions {
  modules: readonly HttpModule[];
  logger: Logger;
  isProduction: boolean;
  bffApiKey: string | null | undefined;
  openApiDocument: object;
}

// 正式進場點跟契約測試都用這組預設值（config 已在 import 時驗證完環境變數）。
export const defaultAppOptions = (): AppOptions => {
  const modules = createHttpModules(appDeps);
  return {
    modules,
    logger,
    isProduction: config.isProduction,
    bffApiKey: config.bffApiKey,
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
  app.use(pinoHttp({ logger: options.logger, customSuccessMessage: () => 'request completed' }));

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
  // 以下都是只給 bff-ts 呼叫的模組，2026-09-05 起套用共用密鑰驗證。
  app.use(createBffAuth({ apiKey: options.bffApiKey }));
  for (const module of options.modules.filter((m) => m.auth === 'bff')) mount(module);

  // 一定要是最後一個 middleware，才接得到前面所有路由丟出來的錯誤。
  app.use(createErrorHandler({ isProduction: options.isProduction }));

  return app;
};
