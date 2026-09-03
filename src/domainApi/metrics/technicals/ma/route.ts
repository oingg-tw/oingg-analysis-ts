import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getMa } from './controller';

const router = Router();

/**
 * @swagger
 * /technicals/ma:
 *   get:
 *     summary: 計算單一公司移動平均線（MA，5D/10D/20D/60D/120D/200D）
 *     description: >
 *       直接讀取 oingg-twse 已寫入資料庫的個股日成交（`daily_price`）計算，本服務本身不向任何
 *       來源抓取股價資料。
 *
 *       計算口徑：
 *       - 全部是簡單移動平均（SMA = 最近 N 天收盤價的算術平均），不是指數移動平均（EMA 只用在
 *         `GET /technicals/macd`）。
 *       - 每個窗口各自獨立判斷資料夠不夠：資料筆數少於窗口天數時該窗口回傳 `null`，
 *         `fieldStatuses` 標成 `no_data`（不是 `calculation_error`，因為之後資料累積足夠會自動
 *         算出來，不是算式本身有問題）。
 *       - **覆蓋率現況（2026-08-30）**：只有 6 家種子公司（2330/2881/2867/2801/2207/2855）有約
 *         5 年歷史（1200+ 交易日，六個窗口都算得出來），其他 1369 檔股票目前只有 3 天資料
 *         （連 MA5D 都不夠），會是 `null` 但不會噴錯——這是覆蓋率限制，不是本服務的邏輯缺陷，
 *         見 [`../README.md`](../README.md) 的說明。
 *       - `asOfDate` 選填，不給就抓「這家公司目前最新一筆股價」；指定的日期不是交易日時，
 *         自動退回往前最近的交易日並在 `warnings` 註明。
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
 *           人類可讀的完整說明，不會回傳錯誤狀態碼（因為「資料還不夠」是正常情境，非伺服器錯誤）。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
registerCompanyRoute(router, '/ma', getMa);

export default router;
