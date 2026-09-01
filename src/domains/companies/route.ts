import { Router } from 'ultimate-express';
import { getCompanies } from './controller';

const router = Router();

/**
 * @swagger
 * /companies:
 *   get:
 *     summary: 列出公司代號/名稱對照表（分頁）
 *     description: >
 *       給 bff-ts 自己快取用，不管是 `valuation/ranking` 這種多公司陣列結果、還是任何其他形狀的
 *       回應，都能自己對照補上公司名稱——跟 `companyId` 為單一公司的一般指標 API 會自動注入
 *       `companyName`（見 [`src/shared/companyNameMiddleware.ts`](../../shared/companyNameMiddleware.ts)）
 *       是互補的兩條路，不是重複：那個只處理「回應最上層剛好只有一個 companyId」的形狀。
 *
 *       涵蓋上市（TWSE）+ 上櫃（TPEx），查不到簡稱的公司 `companyName` 會是 `null`。這是低頻
 *       異動的參考資料，建議 bff-ts 自己快取、不用每次都打。
 *
 *       2026-09-01 加上 `limit`/`offset`：`limit` 這次要拿幾筆由呼叫端自己依業務邏輯決定
 *       （例如依使用者方案給不同筆數），本服務只負責上限（1000，避免一次回應過大）——要拿完
 *       全部公司，用 `count` 自己算要打幾次、搭配 `offset` 依序拉完；也提供 `countOnly=true`
 *       只回總筆數，不用先拉一批資料才知道總共幾筆。
 *     tags:
 *       - System
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 這次要拿幾筆，預設 200，上限 1000。
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         description: 跳過前面幾筆，預設 0。
 *       - in: query
 *         name: countOnly
 *         schema:
 *           type: boolean
 *         description: true 時只回總筆數（`{ count }`），不拉實際資料。
 *     responses:
 *       200:
 *         description: >
 *           `countOnly=true` 時是 `{ count }`；否則是 `{ count, limit, offset, entries }`，
 *           `count` 一律是全部符合條件的總筆數（不是這次回傳的筆數）。
 *       400:
 *         description: 請求的參數格式錯誤，或 limit 超過上限。
 */
router.get('/companies', getCompanies);

export default router;
