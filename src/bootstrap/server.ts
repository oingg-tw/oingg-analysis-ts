import { logger } from '@/infrastructure/logger';
import { config } from '@/infrastructure/config';
import { setStartupTime } from './serverInfo';
import { createApp } from './app';
import { connectAllDbs } from './db';
import { warmCaches } from './warmCaches';

// 2026-09-17 clean architecture 重構 Phase 4：進場點的實際內容（src/index.ts 只剩 dotenv + 呼叫這裡）。
// 順序：連 DB → 載五個啟動快取 → 組 app → listen。
//
// 快取改成在 listen 之前 await（以前是 `void warmCaches()` 背景載入）——五個 loader 本來就是並行
// 的，wall-clock ≈ 最慢那個（~1s），在 Cloud Run startup probe 預算內，換來的是啟動後第一批請求
// 不會再打到冷快取（peer-group/chain-tree/industries 那幾支端點以前在啟動後前幾秒會拿到空結果）。
// 每個 loader 都自己吞掉失敗只記 log（見 warmCaches.ts），所以 await 不會因為某個 export DB 連線問題
// 擋住伺服器啟動。
export const startServer = async ({ startedAt }: { startedAt: [number, number] }): Promise<void> => {
  try {
    // 環境變數（含「正式環境一定要有 BFF_API_KEY」）在 import config 的當下就驗證完了，
    // 缺什麼會直接列出來讓 process 起不來，見 src/infrastructure/config.ts。
    await connectAllDbs();
    await warmCaches();

    const app = createApp();
    // 2026-09-02 bff-ts 回報：'localhost' 這個字串讓 Node 只 bind IPv6 loopback（[::1]），
    // IPv4（127.0.0.1）連不上——Node 的 fetch 解析 localhost 有時候先試 IPv4，導致間歇性
    // connection refused。改成明確的 IPv4 位址，不讓 Node 自己決定要 bind 哪個位址族。
    const host = config.isProduction ? '0.0.0.0' : '127.0.0.1';
    const port = Number(config.port);
    app.listen(port, host, () => {
      const endTime = process.hrtime(startedAt);
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
