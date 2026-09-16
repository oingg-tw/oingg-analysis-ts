import { Router } from 'ultimate-express';
import { listAttentionStocks, type AttentionStocksDeps } from '@/application/market/attentionStocks/service';
import { jsonRoute } from '@/http/route';
import { getAttentionStocksQuerySchema } from './schemas';

export const createAttentionStocksRouter = (deps: AttentionStocksDeps): Router => {
  const router = Router();
  router.get('/market/attention-stocks', ...jsonRoute({ query: getAttentionStocksQuerySchema }, ({ query }) => listAttentionStocks(query, deps)));
  return router;
};
