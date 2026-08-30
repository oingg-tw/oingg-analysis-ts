import { Router } from 'ultimate-express';
import { getMacd } from './controller';

const router = Router();

/**
 * @swagger
 * /technicals/macd:
 *   get:
 *     summary: 計算單一公司平滑異同移動平均線（MACD，12/26/9）
 *     description: >
 *       直接讀取 oingg-twse 已寫入資料庫的個股日成交（`daily_price`）計算，本服務本身不向任何
 *       來源抓取股價資料。
 *
 *       計算口徑：
 *       - `DIF = EMA(12) - EMA(26)`；`DEM`（訊號線） `= EMA(DIF, 9)`；`OSC = DIF - DEM`。
 *         固定參數 (12, 26, 9)，是本服務目前唯一用到 EMA（指數移動平均）的指標，其餘 MA 相關
 *         指標都是 SMA。
 *       - EMA 的種子是前 N 筆的簡單移動平均，數值準確度會隨可用歷史筆數增加而收斂——資料筆數
 *         達到 EMA(26) 但還不到約 3 倍窗口（78 天）時，`dif`/`dem`/`osc` 還是會回傳值，但
 *         `warnings` 會提醒「數值僅供參考」，`dataCoverage.emaConverged` 標示是否已經收斂。
 *       - **覆蓋率現況**：6 家種子公司（2330/2881/2867/2801/2207/2855）歷史夠深、已經收斂，
 *         其他公司目前普遍只有 3 天資料，連 DIF 都算不出來，見 [`../README.md`](../README.md)。
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
 *           計算結果。資料不足時 `dif`/`dem`/`osc` 會是 `null`，`fieldStatuses` 會標明原因分類，
 *           `warnings` 是人類可讀的完整說明，不會回傳錯誤狀態碼。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/macd', getMacd);

export default router;
