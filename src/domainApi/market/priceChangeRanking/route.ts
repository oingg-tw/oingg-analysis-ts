import { Router } from 'ultimate-express';
import { getPriceChangeRanking } from './controller';

const router = Router();

/**
 * @swagger
 * /market/price-change-ranking:
 *   get:
 *     summary: 漲跌幅排行（上市+上櫃合併）
 *     description: >
 *       比較最新交易日跟前一個交易日的收盤價，算出漲跌幅——本服務用 daily_price（全市場收盤價
 *       鏡像）自己算的，不是 twse-ts/tpex-ts 現成算好的 dataset。同時回傳 `gainers`（漲幅前
 *       limit，由大到小）跟 `losers`（跌幅前 limit，由小到大，跌最多排最前面）。
 *
 *       上市（TWSE）跟上櫃（TPEx）各自用自己最新的兩個交易日計算，不強迫兩邊用同一個日期，
 *       每一列的 `tradeDate`/`previousTradeDate` 是該列實際採用的交易日，兩個市場可能不同。
 *       已排除 ETF/衍生性商品，只留真正的上市/上櫃公司。
 *     tags:
 *       - Market
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 預設 20，上限 50，漲幅/跌幅各取這麼多筆。
 *     responses:
 *       200:
 *         description: 漲幅/跌幅前 limit 名。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/market/price-change-ranking', getPriceChangeRanking);

export default router;
