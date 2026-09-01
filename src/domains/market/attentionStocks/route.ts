import { Router } from 'ultimate-express';
import { getAttentionStocks } from './controller';

const router = Router();

/**
 * @swagger
 * /market/attention-stocks:
 *   get:
 *     summary: 注意股票清單（上市+上櫃合併）
 *     description: >
 *       合併 twse-ts（上市）/tpex-ts（上櫃）注意股票累計次數異常公告，`market` 欄位標示來源，
 *       兩邊都已經濾掉權證只留真正公司。取最近公告的前 limit 筆（依交易日由新到舊），不是
 *       固定某一天的資料。`criteria` 是一句話說明原因（例如「115年8月28日至115年8月31日連續
 *       二次」）。
 *     tags:
 *       - Market
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 預設 20，上限 50。
 *     responses:
 *       200:
 *         description: 最近公告的注意股票清單。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/market/attention-stocks', getAttentionStocks);

export default router;
