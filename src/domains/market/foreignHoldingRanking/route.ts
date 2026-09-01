import { Router } from 'ultimate-express';
import { getForeignHoldingRanking } from './controller';

const router = Router();

/**
 * @swagger
 * /market/foreign-holding-ranking:
 *   get:
 *     summary: 外資持股加碼/減碼排行
 *     description: >
 *       比較最近兩個交易日的外資持股比例（`shares_held_percent`，佔已發行股數的百分比），
 *       依「百分點變動」排序，不是持股張數的變動幅度——張數會被增減資干擾，比例才是市場慣用的
 *       「外資加碼/減碼」定義。`topPercent` 是「排序後取前幾 %」，不是固定筆數，母數是兩個
 *       交易日都有資料、可以比較的公司數（`eligibleCompanyCount`）。
 *     tags:
 *       - Market
 *     parameters:
 *       - in: query
 *         name: topPercent
 *         schema:
 *           type: number
 *         description: 預設 10，範圍 1~50。
 *     responses:
 *       200:
 *         description: 加碼/減碼各前 topPercent% 的公司清單。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/market/foreign-holding-ranking', getForeignHoldingRanking);

export default router;
