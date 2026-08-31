import { Router, type Request, type Response } from 'ultimate-express';
import { filterCatalog } from './filterCatalog';

const router = Router();

/**
 * @swagger
 * /filters:
 *   get:
 *     summary: 列出目前可用來 filter 的分類與欄位
 *     description: >
 *       回傳靜態登錄檔（[`filterCatalog.ts`](../../domains/filter/filterCatalog.ts)）——依分類（category）分組，
 *       分類底下是指標（metric，對應一支 API），指標底下是可 filter 的欄位（field，對應該 API 回應 JSON 裡的欄位名稱，
 *       單季/年化/TTM 等不同口徑各自獨立一筆）。只列已實作的指標，前端可以用這支 API 動態組出 filter UI，
 *       不需要把分類/指標清單寫死在前端。
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: 分類 / 指標 / 欄位清單。
 */
router.get('/filters', (req: Request, res: Response) => {
  res.json({ categories: filterCatalog });
});

export default router;
