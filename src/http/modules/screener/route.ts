import { Router } from 'ultimate-express';
import { runScreener, runScreenerRanking, runScreenerValues, getCompanyRank, getFieldDistribution, type ScreenerDeps } from '@/application/screener/service';
import { jsonRoute } from '@/http/route';
import { postScreenerBodySchema, getScreenerRankingQuerySchema, getCompanyRankQuerySchema, postScreenerValuesBodySchema, getScreenerDistributionQuerySchema } from './schemas';

// 服務層的 ValidationError（field 格式/未知 metricCode/sortField 規則/類股代碼…）由 errorHandler 轉成 400 `{ message }`，
// 跟以前 controller 各自 instanceof 判斷後手寫的 body 一樣。
export const createScreenerRouter = (deps: ScreenerDeps): Router => {
  const router = Router();

  router.post('/screener', ...jsonRoute({ body: postScreenerBodySchema }, ({ body }) => runScreener(body, deps)));
  router.get('/screener/ranking', ...jsonRoute({ query: getScreenerRankingQuerySchema }, ({ query }) => runScreenerRanking(query, deps)));
  router.get('/screener/company-rank', ...jsonRoute({ query: getCompanyRankQuerySchema }, ({ query }) => getCompanyRank(query.symbol, query.field, query.direction, query.excludeZero, deps)));
  router.post('/screener/values', ...jsonRoute({ body: postScreenerValuesBodySchema }, ({ body }) => runScreenerValues(body, deps)));
  router.get('/screener/distribution', ...jsonRoute({ query: getScreenerDistributionQuerySchema }, ({ query }) => getFieldDistribution(query.field, query.bins, query.excludeZero, deps)));

  return router;
};
