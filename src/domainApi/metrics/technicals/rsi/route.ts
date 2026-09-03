import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getRsi } from './controller';

const router = Router();

/**
 * @swagger
 * /technicals/rsi:
 *   get:
 *     summary: 計算單一公司相對強弱指標（RSI，6D/14D/24D）
 *     description: >
 *       直接讀取 oingg-twse 已寫入資料庫的個股日成交（`daily_price`）計算，本服務本身不向任何
 *       來源抓取股價資料。
 *
 *       計算口徑：
 *       - 用 Wilder's RSI（業界最常見版本）：前 window 期漲跌幅簡單平均當種子，之後用
 *         `avg = (avg_prev * (window-1) + current) / window` 遞迴平滑，不是簡單移動平均版。
 *       - 每個窗口需要 window+1 天收盤價才能算（要先算出 window 筆漲跌幅），資料不夠時該窗口
 *         回傳 `null`，`fieldStatuses` 標成 `no_data`。
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
registerCompanyRoute(router, '/rsi', getRsi);

export default router;
