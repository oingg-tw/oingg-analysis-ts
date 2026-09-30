import { Router } from 'ultimate-express';
import type { z } from 'zod';
import { enqueueUpstreamChanges, type EnqueueUpstreamChangesDeps } from '@/application/upstream/enqueueUpstreamChanges';
import { jsonRoute, type RouteHandler } from '@/http/route';
import { upstreamChangesBodySchema } from './schemas';

export interface UpstreamAuthOptions {
  keys: { mops: string | null; tpex: string | null; twse: string | null };
  isProduction: boolean;
}

// 2026-09-30 上游變動通知。驗證跟 bff 分開：每個來源自己一把金鑰（X-Upstream-Key），依 body 的 source 比對——
// 身分（Cloud Run IAM 的 ID token）證明「是 GCP 上被授權的帳號」，金鑰證明「是哪一個上游」。正式環境沒設那個來源的
// 金鑰就一律拒絕；本機一把都沒設時放行（跟 bffAuth 同一套規則）。
// 處理邏輯抽成獨立的 handler 讓單元測試直接用假 req/res 測（ultimate-express 對「只有一條路由」的極簡 app 會優化成直接註冊到
// uWS、跳過前面的 express.json()，測試不該依賴那個框架細節；完整 app 裡請求內容有正常解析，2026-09-30 本機實打確認）。
export const createUpstreamChangesHandler =
  (deps: EnqueueUpstreamChangesDeps, auth: UpstreamAuthOptions): RouteHandler<unknown, unknown, z.infer<typeof upstreamChangesBodySchema>> =>
  async ({ body }, req, res) => {
    const expected = auth.keys[body.source];
    const mustCheck = auth.isProduction || Object.values(auth.keys).some((k) => k !== null);
    if (mustCheck && (expected === null || req.headers['x-upstream-key'] !== expected)) {
      res.status(401).json({ message: 'Unauthorized: missing or invalid X-Upstream-Key header for this source.' });
      return undefined;
    }
    const result = await enqueueUpstreamChanges(body, deps);
    res.status(result.queued ? 202 : 200).json(result);
    return undefined;
  };

export const createUpstreamRouter = (deps: EnqueueUpstreamChangesDeps, auth: UpstreamAuthOptions): Router => {
  const router = Router();
  router.post('/upstream/changes', ...jsonRoute({ body: upstreamChangesBodySchema }, createUpstreamChangesHandler(deps, auth)));
  return router;
};
