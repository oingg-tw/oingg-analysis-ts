import { Router } from 'ultimate-express';
import { NotFoundError } from '@/application/errors';
import {
  getStockQuote,
  getStockSummary,
  getStockPrices,
  getExDividendNotices,
  getExDividendCalendar,
  getForeignShareholdingHistory,
  getStockPledgeRatioHistory,
  getDailyPriceHistory,
  type StocksDeps,
} from '@/application/stocks/service';
import { jsonRoute } from '@/http/route';
import {
  symbolParamsSchema,
  symbolsListQuerySchema,
  getExDividendCalendarQuerySchema,
  getForeignShareholdingHistoryQuerySchema,
  getStockPledgeRatioHistoryQuerySchema,
  getDailyPriceHistoryQuerySchema,
} from './schemas';

// 查無公司（上市、上櫃都沒有登記資料）→ 404，body 跟以前 controller 手寫的 `{ message }` 一樣
// （由 errorHandler 對 NotFoundError 產生）。公司存在但查無股價/估值是 200 + 欄位 null，兩種情境分開是 bff-ts 的規格。
const notFound = (symbol: string): NotFoundError => new NotFoundError(`查無公司代號 ${symbol}（上市、上櫃都沒有登記資料）。`);

export const createStocksRouter = (deps: StocksDeps): Router => {
  const router = Router();

  router.get(
    '/stocks/:symbol/quote',
    ...jsonRoute({ params: symbolParamsSchema }, async ({ params }) => (await getStockQuote(params.symbol, deps)) ?? Promise.reject(notFound(params.symbol)))
  );
  // 2026-09-13 新增：個股頁組合端點，見 application/stocks/service.ts 的 getStockSummary 說明。跟 quote 共用同一組 params schema。
  router.get(
    '/stocks/:symbol/summary',
    ...jsonRoute({ params: symbolParamsSchema }, async ({ params }) => (await getStockSummary(params.symbol, deps)) ?? Promise.reject(notFound(params.symbol)))
  );
  router.get('/stocks/prices', ...jsonRoute({ query: symbolsListQuerySchema }, ({ query }) => getStockPrices(query.symbols, deps)));
  router.get('/stocks/ex-dividend-notices', ...jsonRoute({ query: symbolsListQuerySchema }, ({ query }) => getExDividendNotices(query.symbols, deps)));
  router.get(
    '/stocks/ex-dividend-calendar',
    ...jsonRoute({ query: getExDividendCalendarQuerySchema }, ({ query }) => {
      const [year, month] = query.month.split('-').map(Number) as [number, number];
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 0)); // 該月最後一天（下個月第 0 天 = 這個月最後一天）
      return getExDividendCalendar(startDate, endDate, deps);
    })
  );
  router.get(
    '/stocks/:symbol/foreign-shareholding-history',
    ...jsonRoute({ params: symbolParamsSchema, query: getForeignShareholdingHistoryQuerySchema }, ({ params, query }) =>
      getForeignShareholdingHistory(params.symbol, query.limit, deps)
    )
  );
  router.get(
    '/stocks/:symbol/pledge-ratio-history',
    ...jsonRoute({ params: symbolParamsSchema, query: getStockPledgeRatioHistoryQuerySchema }, ({ params, query }) =>
      getStockPledgeRatioHistory(params.symbol, query.limit, deps)
    )
  );
  router.get(
    '/stocks/:symbol/daily-price-history',
    ...jsonRoute({ params: symbolParamsSchema, query: getDailyPriceHistoryQuerySchema }, ({ params, query }) =>
      getDailyPriceHistory(params.symbol, query.limit, deps)
    )
  );

  return router;
};
