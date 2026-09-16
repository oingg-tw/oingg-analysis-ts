import { Router } from 'ultimate-express';
import { getLatestGovBondYield10y } from '@/application/macro/govBondYield10y/service';
import type { AppDeps } from '@/application/deps';
import { handle } from '@/http/route';

// 沒有輸入參數的端點：直接 handle()，不經 validate。掛在 /macro 底下。
export const createGovBondYield10yRouter = (deps: Pick<AppDeps, 'macroData'>): Router => {
  const router = Router();
  router.get(
    '/gov-bond-yield-10y',
    handle(() => getLatestGovBondYield10y(deps))
  );
  return router;
};
