import { Router } from 'ultimate-express';
import { getBollingerBands } from './controller';

const router = Router();

/**
 * @swagger
 * /technicals/bollinger-bands:
 *   get:
 *     summary: 計算單一公司布林通道（Bollinger Bands，20D，2 個標準差）
 *     description: >
 *       直接讀取 oingg-twse 已寫入資料庫的個股日成交（`daily_price`）計算，本服務本身不向任何
 *       來源抓取股價資料。
 *
 *       計算口徑：
 *       - `middle = SMA(20)`，`upper/lower = middle ± 2 個母體標準差`（分母是 N，不是 N-1，
 *         業界慣例算法，不是統計課本的樣本標準差）。
 *       - 三個欄位共用同一份資料齊不齊判斷——`middle` 算得出來，`upper`/`lower` 就一定算得出來。
 *       - **覆蓋率現況同 [`../ma/`](../ma/route.ts)**：只有 6 家種子公司歷史夠深，其他公司目前
 *         普遍只有 3 天資料（少於 20 天），見 [`../README.md`](../README.md)。
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
 *           計算結果。資料不足時三個欄位都會是 `null`，`fieldStatuses` 會標明原因分類，
 *           `warnings` 是人類可讀的完整說明，不會回傳錯誤狀態碼。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/bollinger-bands', getBollingerBands);

export default router;
