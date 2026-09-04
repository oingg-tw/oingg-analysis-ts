import 'dotenv/config'; // Load environment variables from .env file

const startTime = process.hrtime(); // Start timing before any other imports

import express from 'ultimate-express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from './shared/logger';
import { connectAnalysisDb } from './adapters/prisma/analysisClient';
import { connectMopsExportDb } from './adapters/prisma/mopsExportClient';
import { connectGovExportDb } from './adapters/prisma/govExportClient';
import { connectTpexExportDb } from './adapters/prisma/tpexExportClient';
import { connectSitcaExportDb } from './adapters/prisma/sitcaExportClient';
import { connectTwseExportDb } from './adapters/prisma/twseExportClient';
import { swaggerUi, swaggerSpec } from './adapters/swagger';
import { config } from './shared/config';
import { setStartupTime } from './shared/serverInfo';
import routes from './routes';
import errorHandler from './shared/errorHandler';
import { checkFilterCatalogConsistency } from './domainApi/filter/filterCatalogCheck';
import { validateMetricTableRegistry } from './domainApi/filter/metricTableRegistry';
import { loadIndustryCodes } from './shared/sourceData/industryCodes';

const app = express();

// --- Middleware ---
app.use(helmet()); // Apply basic security headers
app.use(cors()); // Enable Cross-Origin Resource Sharing
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
app.use(pinoHttp({ logger, customSuccessMessage: () => 'request completed' }));

// --- API Docs ---
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --- Routes ---
app.use(routes);

// --- Error Handler ---
// This must be the last piece of middleware to catch all errors.
app.use(errorHandler);

// --- Server Start ---
const startServer = async () => {
  try {
    checkFilterCatalogConsistency(config.isProduction);
    validateMetricTableRegistry(config.isProduction);
    await connectAnalysisDb();
    await connectMopsExportDb();
    await connectGovExportDb();
    await connectTpexExportDb();
    await connectSitcaExportDb();
    await connectTwseExportDb();
    // 背景嘗試抓產業代碼對照表——輔助性質，失敗最多重試一次就放棄，不 await（不能因為
    // export DB 連線問題拖慢或擋住伺服器啟動），見 shared/sourceData/industryCodes.ts 的說明。
    void loadIndustryCodes();
    // 2026-09-02 bff-ts 回報：'localhost' 這個字串讓 Node 只 bind IPv6 loopback（[::1]），
    // IPv4（127.0.0.1）連不上——Node 的 fetch 解析 localhost 有時候先試 IPv4，導致間歇性
    // connection refused。改成明確的 IPv4 位址，不讓 Node 自己決定要 bind 哪個位址族。
    const host = config.isProduction ? '0.0.0.0' : '127.0.0.1';
    const port = Number(config.port);
    app.listen(port, host, () => {
      const endTime = process.hrtime(startTime);
      const startupTimeInMs = (endTime[0] * 1e9 + endTime[1]) / 1e6;
      setStartupTime(startupTimeInMs);

      logger.info(`Server is running at http://${host}:${port}`);
      if (!config.isProduction) {
        logger.info(`Server started in ${startupTimeInMs.toFixed(2)}ms`);
        logger.info(`API docs available at http://localhost:${port}/api-docs`);
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};
void startServer();
