import 'dotenv/config'; // Load environment variables from .env file

const startTime = process.hrtime(); // Start timing before any other imports

import { logger } from './infrastructure/logger';
import { config } from './infrastructure/config';
import { setStartupTime } from './bootstrap/serverInfo';
import { createApp } from './bootstrap/app';
import { connectAllDbs } from './bootstrap/db';
import { warmCaches } from './bootstrap/warmCaches';

// 2026-09-17 clean architecture 重構 Phase 0：這支只剩「進場點」的職責——組 app、連 DB、
// 載快取、listen 各自抽到 src/bootstrap/ 底下（HTTP 契約測試要能拿到不 listen 的 app），
// 行為跟抽出前完全一樣，見 src/bootstrap/app.ts 的說明。
const startServer = async () => {
  try {
    // 環境變數（含「正式環境一定要有 BFF_API_KEY」）在 import config 的當下就驗證完了，
    // 缺什麼會直接列出來讓 process 起不來，見 src/infrastructure/config.ts。
    await connectAllDbs();
    // 五個輔助性快取在背景載入，不 await（不能因為 export DB 連線問題拖慢或擋住伺服器啟動），
    // 各自失敗只影響對應端點，見 src/bootstrap/warmCaches.ts。
    void warmCaches();

    const app = createApp();
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
