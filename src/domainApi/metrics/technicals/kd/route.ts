import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getKd } from './controller';

const router = Router();

/**
 * @swagger
 * /technicals/kd:
 *   get:
 *     summary: 計算單一公司隨機指標（KD，9D/14D）
 *     description: >
 *       直接讀取 oingg-twse 已寫入資料庫的個股日成交（`daily_price`）計算，本服務本身不向任何
 *       來源抓取股價資料。
 *
 *       計算口徑：
 *       - `RSV = (收盤 - 期間最低) / (期間最高 - 期間最低) x 100`，`K = 2/3*K_prev + 1/3*RSV`，
 *         `D = 2/3*D_prev + 1/3*K`——K/D 初始值用業界慣例的 50，從序列最早能算出 RSV 的地方
 *         開始遞迴到基準日，不是只看最新一天的 RSV 就當作 K/D。
 *       - K、D 各自是獨立的可 filter 欄位（`k9d`/`d9d`/`k14d`/`d14d`），不是包在同一個物件裡。
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
registerCompanyRoute(router, '/kd', getKd);

export default router;
