import { Router } from 'ultimate-express';
import { getQuote, getPrices } from './controller';

const router = Router();

/**
 * @swagger
 * /stocks/{symbol}/quote:
 *   get:
 *     summary: 查詢單一公司的最新股價/估值報價
 *     description: >
 *       給 bff-ts 用，取代他們拆掉直連 twse/tpex DB 後留的 503（見 2026-09-01 跨服務溝通，
 *       bff-ts 不想知道一檔股票是上市還是上櫃，這支內部自己判斷、查兩邊）。
 *
 *       `price`/`valuation` 個別是 `null` 代表「公司存在，但查無股價/估值資料」（例如剛上市
 *       還沒有交易紀錄），跟「公司根本不存在」（回 404）是不同情境。
 *     tags:
 *       - Stocks
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *         example: "2330"
 *     responses:
 *       200:
 *         description: 最新報價，price/valuation 個別可能是 null。
 *       404:
 *         description: 公司代號在上市、上櫃都查無登記資料。
 */
router.get('/stocks/:symbol/quote', getQuote);

/**
 * @swagger
 * /stocks/prices:
 *   get:
 *     summary: 批次查詢多家公司的最新股價
 *     description: >
 *       給 bff-ts 用，一次查明確列出的幾檔公司（例如 screener 一頁的量），不是開放式查詢。
 *       刻意不做 limit/count_only：查不到的 symbol 就不會出現在 `prices` 物件裡，不會靜默
 *       截斷成某個數量以內——`symbols` 一次最多 100 檔，超過直接回 400，不會默默只回一部分。
 *     tags:
 *       - Stocks
 *     parameters:
 *       - in: query
 *         name: symbols
 *         required: true
 *         schema:
 *           type: string
 *         description: 逗號分隔的公司代號清單
 *         example: "2330,2317,2454"
 *     responses:
 *       200:
 *         description: 以 symbol 為 key 的股價對照表，查不到的 symbol 不會出現在裡面。
 *       400:
 *         description: 請求的參數格式錯誤，或 symbols 超過一次上限。
 */
router.get('/stocks/prices', getPrices);

export default router;
