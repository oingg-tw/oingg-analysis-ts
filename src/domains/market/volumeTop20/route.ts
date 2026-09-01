import { Router } from 'ultimate-express';
import { getVolumeTop20Ranking } from './controller';

const router = Router();

/**
 * @swagger
 * /market/volume-top20:
 *   get:
 *     summary: 集中市場成交量前 20 名
 *     description: >
 *       最新一個交易日、twse-ts 官方算好的成交量排名跟漲跌，不是自己拿股價兩天資料相減算的。
 *       ⚠️ 沒有排除 ETF/衍生性商品，回傳的是原始排名（跟本服務其他主打「上市公司證券」的排行
 *       榜不一樣，這支是應使用者要求刻意保留原樣）。
 *     tags:
 *       - Market
 *     responses:
 *       200:
 *         description: 成交量前 20 名。
 */
router.get('/market/volume-top20', getVolumeTop20Ranking);

export default router;
