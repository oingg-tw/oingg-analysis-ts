import { Router } from 'ultimate-express';
import { getSecuritiesIndustrySectors, getSectorDividendSummary, getSectorMetricHistory, getSectorMonthlyRevenueHistory, getSectorSummary, type IndustriesDeps } from '@/application/industries/service';
import { getSectorMetricHistoryQuerySchema, getSectorMonthlyRevenueHistoryQuerySchema, getSectorSummaryQuerySchema, sectorParamsSchema } from './types';
import { jsonRoute } from '@/http/route';

export const createIndustriesRouter = (deps: IndustriesDeps): Router => {
  const router = Router();

  router.get('/industries/securities-sectors', ...jsonRoute({}, () => getSecuritiesIndustrySectors(deps)));
  router.get('/industries/sector-dividend-summary', ...jsonRoute({}, () => getSectorDividendSummary(deps)));
  router.get('/industries/sector-summary', ...jsonRoute({ query: getSectorSummaryQuerySchema }, ({ query }) => getSectorSummary(query, deps)));
  router.get(
    '/industries/:sectorCode/metric-history',
    ...jsonRoute({ params: sectorParamsSchema, query: getSectorMetricHistoryQuerySchema }, ({ params, query }) => getSectorMetricHistory({ ...query, sectorCode: params.sectorCode }, deps))
  );
  router.get(
    '/industries/:sectorCode/monthly-revenue-history',
    ...jsonRoute({ params: sectorParamsSchema, query: getSectorMonthlyRevenueHistoryQuerySchema }, ({ params, query }) => getSectorMonthlyRevenueHistory({ ...query, sectorCode: params.sectorCode }, deps))
  );

  return router;
};
