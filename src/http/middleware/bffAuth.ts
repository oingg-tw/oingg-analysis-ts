import type { RequestHandler } from 'ultimate-express';

// api/bff 目前只有 bff-ts 會呼叫（2026-09-05 使用者確認）——共用密鑰是這個情境下最簡單、
// 成本最低的驗證方式，不需要 OAuth/JWT 那種多方發放/撤銷憑證的複雜度。bff-ts 每次請求要帶
// `X-Api-Key` header，值跟 BFF_API_KEY 環境變數一致（透過內部管道約定，不進版控）。
//
// 本機開發沒設 BFF_API_KEY 時直接放行——正式環境一定要設（config 載入時就檢查，沒設會直接讓
// 伺服器啟動失敗，不會悄悄變成「正式環境也不驗證」）。
// 2026-09-17 Phase 4 改成工廠：密鑰由 bootstrap 從 config 讀了傳進來，http 層不碰 config。
export const createBffAuth =
  ({ apiKey }: { apiKey: string | null | undefined }): RequestHandler =>
  (req, res, next) => {
    if (!apiKey) {
      next();
      return;
    }

    const providedKey = req.headers['x-api-key'];
    if (providedKey !== apiKey) {
      res.status(401).json({ message: 'Unauthorized: missing or invalid X-Api-Key header.' });
      return;
    }

    next();
  };
