import { Router, type Request, type Response } from 'ultimate-express';
import { sendProblem } from '@/http/problem';

const HEALTH_DB_TIMEOUT_MS = 3000;

// 健康檢查（Cloud Run/uptime 監控打這支，不需要密鑰）。啟動耗時由 bootstrap 量測後注入
// （2026-09-17 Phase 4：以前直接 import bootstrap/serverInfo，是 http → bootstrap 的反向依賴）。
// 2026-10-08 GET /health（bff-ts 要求，web-nuxt 的讀取失敗對話框會輪詢 bff 的 /system/health，bff 再問這支）：不需要密鑰；
// 對 analysis 資料庫跑一個最小查詢（3 秒逾時），正常 200、資料庫沒醒或查詢失敗 503（RFC 9457）。pingDatabase 由 bootstrap 注入（http 不碰資料庫）。
// GET / 照舊保留：bff 在這支上線前用它當存活檢查，改它要先通知 bff。
// 同日起也探測每個上游 export 庫的一個 view（見 bootstrap/db.ts pingDatabases），任何一個不通就 503、detail 列出是哪幾個。
// Cloud Run 只拿 GET / 當 startup probe、沒有 liveness probe，所以上游掛掉回 503 不會讓容器被重啟。
export const createSystemRouter = ({ getStartupTime, pingDatabases }: { getStartupTime: () => number | null; pingDatabases: () => Promise<string[]> }): Router => {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const startupTime = getStartupTime();
    const startupMessage = startupTime !== null ? `Server startup time: ${startupTime.toFixed(2)}ms` : 'Startup time not yet available.';

    res.json({
      startupTime: startupMessage,
    });
  });

  router.get('/health', async (_req: Request, res: Response) => {
    let failed: string[];
    try {
      failed = await Promise.race([pingDatabases(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), HEALTH_DB_TIMEOUT_MS))]);
    } catch {
      sendProblem(res, 503, 'Databases did not respond within 3 seconds.');
      return;
    }
    if (failed.length > 0) {
      sendProblem(res, 503, `Database or upstream export view not available: ${failed.join(', ')}.`);
      return;
    }
    res.json({ status: 'ok', database: 'ok' });
  });

  return router;
};
