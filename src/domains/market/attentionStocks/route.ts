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
 *       固定某一天的資料。`criteria` 是原始中文說明（例如「115年8月28日至115年8月31日連續
 *       二次」），`criteriaDetails` 是解析出的結構化資料（開始/結束日期、次數）——`criteria`
 *       可能包含多個原因子句直接串接在一起，所以 `criteriaDetails` 是陣列；解析失敗（上游文字
 *       格式之後改變）時是空陣列，不影響 `criteria` 原始文字本身。`sixDayChangePercent` 是以
 *       `tradeDate` 為基準日的近6個交易日累積漲跌幅——交易所注意股票的門檻本來就包含「近6日
 *       累積漲跌幅逾25%~32%」這類標準，這裡是點對點比較（基準日收盤 vs 往前數6個交易日收盤），
 *       不是逐日漲跌幅相加，隱含複利效應；資料不足6個交易日時是 null。
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
