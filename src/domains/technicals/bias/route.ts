import { Router } from 'ultimate-express';
import { getBias } from './controller';

const router = Router();

/**
 * @swagger
 * /technicals/bias:
 *   get:
 *     summary: 計算單一公司乖離率（BIAS，5D/20D/60D）
 *     description: >
 *       直接讀取 oingg-twse 已寫入資料庫的個股日成交（`daily_price`）計算，本服務本身不向任何
 *       來源抓取股價資料。
 *
 *       計算口徑：
 *       - `BIAS = (收盤 - MA) / MA x 100%`，MA 用 [`../ma/`](../ma/route.ts) 同一套簡單移動平均
 *         現算，同一個視窗長度會得到一樣的 MA 值，不是重複實作。
 *       - MA 算不出來（資料不夠）乖離率也就算不出來，兩者共用同一份資料齊不齊判斷。
 *       - **覆蓋率現況同 [`../ma/`](../ma/route.ts)**：只有 6 家種子公司歷史夠深，其他公司目前
 *         普遍只有 3 天資料，見 [`../README.md`](../README.md)。
 *       - `asOfDate` 選填，不給就抓「這家公司目前最新一筆股價」。
 *     tags:
 *       - Technicals
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: 公司代號（6 家種子公司歷史深度最完整，其他公司覆蓋率會持續成長）
 *         example: "2330"
 *       - in: query
 *         name: asOfDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 基準日，選填（不給就抓最新一筆股價）
 *         example: "2026-06-30"
 *     responses:
 *       200:
 *         description: >
 *           計算結果。資料不足的窗口會是 `null`，`fieldStatuses` 會標明原因分類，`warnings` 是
 *           人類可讀的完整說明，不會回傳錯誤狀態碼。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/bias', getBias);

export default router;
