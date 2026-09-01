import { Router } from 'ultimate-express';
import { getRevenueRanking } from './controller';

const router = Router();

/**
 * @swagger
 * /market/revenue-ranking:
 *   get:
 *     summary: 月營收排行
 *     description: >
 *       取最新一個月份的月營收資料排行，只留上市或上櫃公司（monthly_revenue 來源範圍是
 *       「公開發行公司」，比上市櫃更廣，不篩選會混進非上市櫃公司）。`metric` 決定依哪個數字
 *       排序：`yoy`（年增率，最常見的「營收爆發」選股指標）、`mom`（月增率，波動較大）、
 *       `revenue`（單季營收金額本身，偏向大型權值股）。
 *     tags:
 *       - Market
 *     parameters:
 *       - in: query
 *         name: metric
 *         required: true
 *         schema:
 *           type: string
 *           enum: [yoy, mom, revenue]
 *       - in: query
 *         name: order
 *         required: true
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 預設 20，上限 50。
 *     responses:
 *       200:
 *         description: 前 limit 名的月營收排行。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/market/revenue-ranking', getRevenueRanking);

export default router;
