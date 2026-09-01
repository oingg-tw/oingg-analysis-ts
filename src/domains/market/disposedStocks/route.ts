import { Router } from 'ultimate-express';
import { getDisposedStocks } from './controller';

const router = Router();

/**
 * @swagger
 * /market/disposed-stocks:
 *   get:
 *     summary: 處置股票清單
 *     description: >
 *       集中市場處置股票公告，twse-ts 已濾掉權證只留真正上市公司。稀疏資料，不是每天都有，
 *       取最近公告的前 limit 筆（依公告日期由新到舊），不是固定某一天的資料。
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
 *         description: 最近公告的處置股票清單。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/market/disposed-stocks', getDisposedStocks);

export default router;
