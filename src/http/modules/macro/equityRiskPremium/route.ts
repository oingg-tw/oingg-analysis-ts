import { Router } from 'ultimate-express';
import { calculateEquityRiskPremium, type EquityRiskPremiumDeps } from '@/application/macro/equityRiskPremium/service';
import { jsonRoute } from '@/http/route';
import { equityRiskPremiumQuerySchema } from './schemas';

// 2026-09-17 Phase 4 薄 controller 的範本：驗證交給 jsonRoute（400 body 不變）、業務邏輯在 application 的 use case、
// deps 由 bootstrap 傳進來。掛在 /macro 底下（見 bootstrap/httpModules.ts 的 mountPath）。
export const createEquityRiskPremiumRouter = (deps: EquityRiskPremiumDeps): Router => {
  const router = Router();
  router.get('/equity-risk-premium', ...jsonRoute({ query: equityRiskPremiumQuerySchema }, ({ query }) => calculateEquityRiskPremium(query, deps)));
  return router;
};
