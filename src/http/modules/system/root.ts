import { Router, type Request, type Response } from 'ultimate-express';

// 健康檢查（Cloud Run/uptime 監控打這支，不需要密鑰）。啟動耗時由 bootstrap 量測後注入
// （2026-09-17 Phase 4：以前直接 import bootstrap/serverInfo，是 http → bootstrap 的反向依賴）。
export const createSystemRouter = ({ getStartupTime }: { getStartupTime: () => number | null }): Router => {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const startupTime = getStartupTime();
    const startupMessage = startupTime !== null ? `Server startup time: ${startupTime.toFixed(2)}ms` : 'Startup time not yet available.';

    res.json({
      startupTime: startupMessage,
    });
  });

  return router;
};
