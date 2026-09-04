import type { Router } from 'ultimate-express';
import { getCompanyName } from './sourceData/companyProfile';
import { logger } from '@/shared/logger';

// 取代原本「每個 controller 自己呼叫 sendWithCompanyName」的做法（2026-09-01 使用者要求）——
// 那個做法的問題是「以後新增單一公司端點時，忘記加這一行也不會有任何錯誤提示，會悄悄漏掉」，
// 跟原本被砍掉的全域 middleware 用「猜回應形狀」補名稱是不同種問題，但一樣不夠可靠。
//
// 這裡改成「明確註冊」：route.ts 要嘛用這個函式掛路由（一定會補公司名稱，而且 TypeScript
// 會在編譯期強制 handler 的回傳型別要有 symbol，不是 handler 忘記回傳正確形狀也不會報錯），
// 要嘛用原本的 router.get() 掛（完全不補，例如 ranking/equityRiskPremium 這種不是「單一公司」
// 的端點）——一看 route.ts 就知道哪些端點有這個行為，不是藏在 index.ts 對全部回應通殺猜形狀。
//
// req/res 用結構型別（只要求 query 存在、status().json() 存在），不綁死 express 或
// ultimate-express 的型別，跟 sendWithCompanyName.ts 當初的理由一樣：這個專案兩種都有
// controller 在用，用結構型別才不會因為匯入來源不同而型別對不上。
export interface CompanyRouteRequest {
  query: unknown;
}
export interface CompanyRouteResponse {
  status: (code: number) => { json: (body: unknown) => void };
}

// handler 回傳 undefined 代表「已經自己送出回應了」（例如 zod 驗證失敗回 400），
// registerCompanyRoute 就不會再動作；回傳實際結果（一定要有 symbol）才會補名稱送出。
export type CompanyRouteHandler<T extends { symbol: string }> = (req: CompanyRouteRequest, res: CompanyRouteResponse) => Promise<T | undefined>;

export const registerCompanyRoute = <T extends { symbol: string }>(router: Router, path: string, handler: CompanyRouteHandler<T>): void => {
  router.get(path, async (req, res, next) => {
    try {
      const result = await handler(req, res);
      if (result === undefined) return; // handler 已經自己送出回應（例如驗證失敗的 400），不用再做事。

      const companyName = await getCompanyName(result.symbol).catch((error) => {
        logger.error({ err: error }, `[registerCompanyRoute ${path}]: 查詢公司名稱失敗，回傳原始結果不補公司名稱。`);
        return null;
      });
      res.status(200).json({ ...result, companyName });
    } catch (error) {
      logger.error({ err: error }, `[registerCompanyRoute ${path}]: 計算失敗。`);
      next(error);
    }
  });
};
