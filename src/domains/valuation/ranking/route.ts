import { Router } from 'ultimate-express';
import { getRanking } from './controller';

const router = Router();

/**
 * @swagger
 * /valuation/ranking:
 *   get:
 *     summary: 依 PER、PBR 或殖利率排行全市場公司
 *     description: >
 *       直接查詢 oingg-twse 的 `daily_valuation`（已經算好、每天更新，涵蓋約 1080 檔股票），
 *       本服務不重新計算，也不需要事先把每家公司都查過一次——跟本服務其他「查一家公司」的指標
 *       完全不同的查詢型態，這支是全市場排行，見 [`../README.md`](../README.md)「排行榜 vs
 *       單一公司查詢」的說明。
 *
 *       計算口徑：
 *       - `metric=peRatio&order=asc`：低本益比排行。`metric=pbRatio&order=asc`：低淨值比排行。
 *         `metric=dividendYield&order=desc`：高殖利率排行。`order` 沒有預設值，必須自己指定，
 *         避免呼叫端誤會排序方向。
 *       - **`peRatio`/`pbRatio` 排除 <= 0 的公司**（虧損或淨值為負），這種情況不是「便宜」，
 *         是財務體質出問題，混進「最低本益比」排行榜會誤導——回應的 `excludedNonPositiveCount`
 *         記錄排除了幾家。`dividendYield` 沒有這個排除（沒配息是 0，不是負的）。
 *       - `date` 選填，不給就抓 `daily_valuation` 目前最新一個交易日。
 *     tags:
 *       - Valuation
 *     parameters:
 *       - in: query
 *         name: metric
 *         required: true
 *         schema:
 *           type: string
 *           enum: ["peRatio", "pbRatio", "dividendYield"]
 *         description: 要排行的欄位
 *       - in: query
 *         name: order
 *         required: true
 *         schema:
 *           type: string
 *           enum: ["asc", "desc"]
 *         description: 排序方向，沒有預設值，必須自己指定
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: 回傳筆數，預設 20，最多 100
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: 交易日，選填（不給就抓最新一個交易日）
 *         example: "2026-08-28"
 *     responses:
 *       200:
 *         description: >
 *           排行結果，依 rank 由 1 開始編號。查無資料時 `rankings` 是空陣列，`warnings` 說明原因，
 *           不會回傳錯誤狀態碼。
 *       400:
 *         description: 請求的參數格式錯誤（例如沒給 metric/order）。
 */
router.get('/ranking', getRanking);

export default router;
