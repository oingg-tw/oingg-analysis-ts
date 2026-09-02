import { Router } from 'ultimate-express';
import { getDisposedStocks } from './controller';

const router = Router();

/**
 * @swagger
 * /market/disposed-stocks:
 *   get:
 *     summary: 處置股票清單（上市+上櫃合併）
 *     description: >
 *       合併 twse-ts（上市）/tpex-ts（上櫃）處置股票公告，`market` 欄位標示來源，只保留真正的
 *       上市/上櫃公司（比對 company_profile）。稀疏資料，不是每天都有，取最近公告的前 limit
 *       筆（依公告日期由
 *       新到舊），不是固定某一天的資料。TPEx 版本欄位比 TWSE 精簡（沒有 announcementCount/
 *       dispositionMeasures/linkInformation），沒有的欄位回傳 null。`sixDayChangePercent` 是
 *       以 `announceDate` 為基準日的近6個交易日累積漲跌幅，點對點比較（基準日收盤 vs 往前數6
 *       個交易日收盤），不是逐日漲跌幅相加，隱含複利效應；資料不足6個交易日時是 null。
 *       `reasonTimes` 是從 `reason` 解析出的次數（例如「連續五次」→5、「最近10個營業日內有6
 *       個營業日」→6），部分處置原因（例如可轉債標的證券）本身沒有次數概念，這時是 null。
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
