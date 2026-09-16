import { Router } from 'ultimate-express';
import { getTaiexDailyPrice, type TaiexDailyPriceDeps } from '@/application/market/taiexDailyPrice/service';
import { jsonRoute } from '@/http/route';
import { getTaiexDailyPriceQuerySchema } from './schemas';

export const createTaiexDailyPriceRouter = (deps: TaiexDailyPriceDeps): Router => {
  const router = Router();
  router.get('/market/taiex-daily-price', ...jsonRoute({ query: getTaiexDailyPriceQuerySchema }, ({ query }) => getTaiexDailyPrice(query.limit, deps)));
  return router;
};
