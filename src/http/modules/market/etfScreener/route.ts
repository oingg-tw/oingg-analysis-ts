import { Router } from 'ultimate-express';
import { runEtfScreener, getEtfFilterCatalog, type EtfScreenerDeps } from '@/application/market/etfScreener/service';
import { jsonRoute } from '@/http/route';
import { postEtfScreenerBodySchema } from './schemas';

// use case 丟的 ValidationError（未知欄位、filter 形狀不對、sortField 規則…）由 errorHandler 轉成 400 `{ message }`，
// 跟以前 controller 的 instanceof 分支一樣。
export const createEtfScreenerRouter = (deps: EtfScreenerDeps): Router => {
  const router = Router();
  router.get('/etf-screener/filters', ...jsonRoute({}, () => getEtfFilterCatalog(deps)));
  router.post('/etf-screener', ...jsonRoute({ body: postEtfScreenerBodySchema }, ({ body }) => runEtfScreener(body, deps)));
  return router;
};
