import { Router, type Request, type Response } from 'ultimate-express';
import { listAllCompanyNames } from '@/shared/sourceData/companyProfile';

const router = Router();

/**
 * @swagger
 * /companies:
 *   get:
 *     summary: 列出全部公司代號/名稱對照表
 *     description: >
 *       給 bff-ts 自己快取用，一次拿到全部公司的 `companyId`/`companyName` 對照表，之後不管是
 *       `valuation/ranking` 這種多公司陣列結果、還是任何其他形狀的回應，都能自己對照補上公司
 *       名稱——跟 `companyId` 為單一公司的一般指標 API 會自動注入 `companyName`（見
 *       [`src/shared/companyNameMiddleware.ts`](../../shared/companyNameMiddleware.ts)）是互補
 *       的兩條路，不是重複：那個只處理「回應最上層剛好只有一個 companyId」的形狀。
 *
 *       只涵蓋上市（TWSE）公司（`company_profile` 目前的覆蓋範圍），查不到簡稱的公司
 *       `companyName` 會是 `null`。這是低頻異動的參考資料，建議 bff-ts 自己快取、不用每次都打。
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: 全部公司的 companyId/companyName 對照表陣列。
 */
router.get('/companies', async (req: Request, res: Response, next) => {
  try {
    const companies = await listAllCompanyNames();
    res.json(companies);
  } catch (error) {
    next(error);
  }
});

export default router;
