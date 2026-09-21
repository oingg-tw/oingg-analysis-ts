import { Router } from 'ultimate-express';
import { getBusinessCycleIndicators, getCpi, getGdp, getGovBondYield10yHistory, getMonetaryAggregates, getUsdTwdRates, type MacroSeriesDeps } from '@/application/macro/series/service';
import { jsonRoute } from '@/http/route';
import { cpiQuerySchema, gdpQuerySchema, monthlySeriesQuerySchema, usdTwdRateQuerySchema } from './schemas';

// 總經特區六支，掛在 /macro 底下（見 bootstrap/httpModules.ts 的 mountPath）。
export const createMacroSeriesRouter = (deps: MacroSeriesDeps): Router => {
  const router = Router();
  router.get('/business-cycle-indicator', ...jsonRoute({ query: monthlySeriesQuerySchema }, ({ query }) => getBusinessCycleIndicators(query, deps)));
  router.get('/monetary-aggregate', ...jsonRoute({ query: monthlySeriesQuerySchema }, ({ query }) => getMonetaryAggregates(query, deps)));
  router.get('/gov-bond-yield-10y-history', ...jsonRoute({ query: monthlySeriesQuerySchema }, ({ query }) => getGovBondYield10yHistory(query, deps)));
  router.get('/usd-twd-rate', ...jsonRoute({ query: usdTwdRateQuerySchema }, ({ query }) => getUsdTwdRates(query.limit, query.interval, deps)));
  router.get('/cpi', ...jsonRoute({ query: cpiQuerySchema }, ({ query }) => getCpi(query, deps)));
  router.get('/gdp', ...jsonRoute({ query: gdpQuerySchema }, ({ query }) => getGdp(query, deps)));
  return router;
};
