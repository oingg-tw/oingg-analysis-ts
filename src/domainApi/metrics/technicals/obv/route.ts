import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getObv } from './controller';

const router = Router();

/**
 * @swagger
 * /technicals/obv:
 *   get:
 *     summary: 計算單一公司能量潮（OBV）
 *     description: >
 *       直接讀取 oingg-twse 已寫入資料庫的個股日成交（`daily_price`）計算，本服務本身不向任何
 *       來源抓取股價資料。
 *
 *       計算口徑：
 *       - `OBV`：從 `daily_price` 目前收錄的最早一筆開始累加，收盤價比前一天高就加成交量、
 *         比前一天低就減成交量、打平不動。是累積值，不是某個固定天數視窗的指標，也沒有跨公司
 *         比較意義（不同公司歷史起點不同），只有同一家公司內看趨勢變化才有意義。
 *       - **taxonomy 的 `VWAP_OBV` 這裡只做了 OBV，VWAP（成交量加權平均價）本服務做不到**：
 *         真正的 VWAP 需要當日盤中逐筆或分鐘 K 線資料才能算，`daily_price` 只有每天一筆的
 *         開高低收/總量，沒有盤中細節——這是結構性資料缺口，不會隨資料累積解決，不是漏做。
 *       - **覆蓋率現況同 [`../ma/`](../ma/route.ts)**：只有 6 家種子公司歷史夠深，其他公司目前
 *         普遍只有 3 天資料，見 [`../README.md`](../README.md)。
 *       - `asOfDate` 選填，不給就抓「這家公司目前最新一筆股價」。
 *     tags:
 *       - Technicals
 *     parameters:
 *       - in: query
 *         name: symbol
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
 *           計算結果。查無股價資料時 `obv` 會是 `null`，`fieldStatuses` 會標明原因分類，
 *           `warnings` 是人類可讀的完整說明，不會回傳錯誤狀態碼。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
registerCompanyRoute(router, '/obv', getObv);

export default router;
