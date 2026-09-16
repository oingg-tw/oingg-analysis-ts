import { Router } from 'ultimate-express';
import { getPriceLimitRange, type PriceLimitRangeDeps } from '@/application/market/priceLimitRange/service';
import { jsonRoute } from '@/http/route';

export const createPriceLimitRangeRouter = (deps: PriceLimitRangeDeps): Router => {
  const router = Router();
  router.get('/market/price-limit-range', ...jsonRoute({}, () => getPriceLimitRange(deps)));
  return router;
};
