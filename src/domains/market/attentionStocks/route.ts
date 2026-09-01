import { Router } from 'ultimate-express';
import { getAttentionStocks } from './controller';

const router = Router();

/**
 * @swagger
 * /market/attention-stocks:
 *   get:
 *     summary: 注意股票清單
 *     description: >
 *       集中市場注意股票累計次數異常公告，twse-ts 已濾掉權證只留真正上市公司。取最近公告的前
 *       limit 筆（依交易日由新到舊），不是固定某一天的資料。`criteria` 是一句話說明原因
 *       （例如「115年8月28日至115年8月31日連續二次」）。
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
