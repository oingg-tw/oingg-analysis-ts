import { Router } from 'ultimate-express';
import { listPreferredStocks, type ListPreferredStocksDeps } from '@/application/preferredStock/listPreferredStocks';
import { jsonRoute } from '@/http/route';
import { PREFERRED_STOCK_FIELD_CATALOG } from './fieldCatalog';
import { getPreferredStocksQuerySchema } from './schemas';

export const createPreferredStockRouter = (deps: ListPreferredStocksDeps): Router => {
  const router = Router();

  // 2026-09-08 新增——給前端 hover 顯示公式說明用（見 fieldCatalog.ts 的說明）。純靜態
  // 資料，不查任何資料庫，跟 GET /preferred-stocks 完全獨立、互不影響。
  router.get('/preferred-stocks/field-catalog', ...jsonRoute({}, async () => ({ fields: PREFERRED_STOCK_FIELD_CATALOG })));
  router.get('/preferred-stocks', ...jsonRoute({ query: getPreferredStocksQuerySchema }, ({ query }) => listPreferredStocks(query, deps)));

  return router;
};
