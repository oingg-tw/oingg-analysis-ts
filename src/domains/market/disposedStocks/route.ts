import { Router } from 'ultimate-express';
import { getDisposedStocks } from './controller';

const router = Router();

/**
 * @swagger
 * /market/disposed-stocks:
 *   get:
 *     summary: 處置股票清單（上市+上櫃合併）
 *     description: >
 *       合併 twse-ts（上市）/tpex-ts（上櫃）處置股票公告，`market` 欄位標示來源，兩邊都已經
 *       濾掉權證只留真正公司。稀疏資料，不是每天都有，取最近公告的前 limit 筆（依公告日期由
 *       新到舊），不是固定某一天的資料。TPEx 版本欄位比 TWSE 精簡（沒有 announcementCount/
 *       dispositionMeasures/linkInformation），沒有的欄位回傳 null。
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
