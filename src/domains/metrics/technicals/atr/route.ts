import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getAtr } from './controller';

const router = Router();

/**
 * @swagger
 * /technicals/atr:
 *   get:
 *     summary: 計算單一公司真實波動區間均值（ATR，14D/20D）
 *     description: >
 *       直接讀取 oingg-twse 已寫入資料庫的個股日成交（`daily_price`）計算，本服務本身不向任何
 *       來源抓取股價資料。
 *
 *       計算口徑：
 *       - 真實波動幅度 `TR = max(高-低, |高-前收|, |低-前收|)`，`ATR` 是 `TR` 的 Wilder 平滑
 *         移動平均（前 window 期簡單平均當種子，之後遞迴平滑），跟 RSI 同一種 Wilder 慣例。
 *       - 每個窗口需要 window+1 天高低收才能算，資料不夠時該窗口回傳 `null`。
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
registerCompanyRoute(router, '/atr', getAtr);

export default router;
