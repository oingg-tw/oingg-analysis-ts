import 'dotenv/config'; // Load environment variables from .env file

const startTime = process.hrtime(); // Start timing before any other imports

import express from 'ultimate-express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
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
import { checkFilterCatalogConsistency } from './domains/filter/filterCatalogCheck';
import { validateMetricTableRegistry } from './domains/filter/metricTableRegistry';
import { loadIndustryCodes } from './shared/sourceData/industryCodes';

const app = express();

// --- Middleware ---
app.use(helmet()); // Apply basic security headers
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging - only in development
if (!config.isProduction) {
  app.use(morgan('dev'));
}

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
    // dev 環境背景嘗試抓產業代碼對照表——輔助性質，失敗最多重試一次就放棄，不 await（不能因為
    // localhost:8081 沒開就拖慢或擋住伺服器啟動），見 shared/sourceData/industryCodes.ts 的說明。
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

      console.log(`[server]: Server is running at http://${host}:${port}`);
      if (!config.isProduction) {
        console.log(`[server]: Server started in ${startupTimeInMs.toFixed(2)}ms`);
        console.log(`[server]: API docs available at http://localhost:${port}/api-docs`);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};
startServer();
