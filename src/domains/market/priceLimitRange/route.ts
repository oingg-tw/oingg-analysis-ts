import { Router } from 'ultimate-express';
import { getPriceLimitRangeRanking } from './controller';

const router = Router();

/**
 * @swagger
 * /market/price-limit-range:
 *   get:
 *     summary: 漲跌停幅度最大/最小各 20 檔
 *     description: >
 *       最新一個交易日，上市個股漲跌停幅度（limitRange = limitUp - limitDown）最大前 20
 *       （`widest`）、最小前 20（`narrowest`）。twse-ts 已經先過濾成只留真正上市公司（原始
 *       回應含權證共 3.3 萬多筆），這裡不用再濾一次。
 *     tags:
 *       - Market
 *     responses:
 *       200:
 *         description: 漲跌停幅度最大/最小各前 20 檔。
 */
router.get('/market/price-limit-range', getPriceLimitRangeRanking);

export default router;
