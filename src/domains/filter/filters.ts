import { Router, type Request, type Response } from 'ultimate-express';
import { filterCatalog } from './filterCatalog';
import { columnPresets } from './columnPresets';

const router = Router();

/**
 * @swagger
 * /filters:
 *   get:
 *     summary: 列出目前可用來 filter 的分類與欄位，以及產品內建的策展預設 view
 *     description: >
 *       回傳靜態登錄檔（[`filterCatalog.ts`](../../domains/filter/filterCatalog.ts)）——依分類（category）分組，
 *       分類底下是指標（metric，對應一支 API），指標底下是可 filter 的欄位（field，對應該 API 回應 JSON 裡的欄位名稱，
 *       單季/年化/TTM 等不同口徑各自獨立一筆）。只列已實作的指標，前端可以用這支 API 動態組出 filter UI，
 *       不需要把分類/指標清單寫死在前端。
 *
 *       `columnPresets`（[`columnPresets.ts`](../../domains/filter/columnPresets.ts)）是產品內建的
 *       幾組策展過的欄位組合（例如「存股領息」「價值投資」），給使用者一鍵套用用——跟使用者自己
 *       客製化要看哪些欄位是不同的兩件事，那種個人 UI 偏好狀態不需要 analysis-ts 參與，應該由
 *       前端或 bff-ts 處理。`fieldKeys` 格式是 `"metricKey.fieldKey"`（不能只用裸的 field key——
 *       部分 field key 同時存在於兩個不同 metric 底下，裸 key 會有歧義），前端自己去
 *       `categories` 對應的 metric 底下找出這個 field 的完整定義。剛好一組（`overview`）會有
 *       `isDefault: true`，是使用者選擇之前該顯示的中性初始畫面，不偏向任何一種投資風格。
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: 分類 / 指標 / 欄位清單，以及策展預設 view 清單。
 */
router.get('/filters', (req: Request, res: Response) => {
  res.json({ categories: filterCatalog, columnPresets });
});

export default router;
