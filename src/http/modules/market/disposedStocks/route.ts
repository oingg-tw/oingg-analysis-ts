import { Router } from 'ultimate-express';
import { listDisposedStocks, type DisposedStocksDeps } from '@/application/market/disposedStocks/service';
import { jsonRoute } from '@/http/route';
import { getDisposedStocksQuerySchema } from './schemas';

export const createDisposedStocksRouter = (deps: DisposedStocksDeps): Router => {
  const router = Router();
  router.get('/market/disposed-stocks', ...jsonRoute({ query: getDisposedStocksQuerySchema }, ({ query }) => listDisposedStocks(query, deps)));
  return router;
};
