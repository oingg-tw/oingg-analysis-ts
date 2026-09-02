import { Router } from 'ultimate-express';
import { getGovBondYield10y } from './controller';

const router = Router();

/**
 * @swagger
 * /macro/gov-bond-yield-10y:
 *   get:
 *     summary: 10 年期政府公債次級市場殖利率（最新一個月）
 *     description: >
 *       只回傳最新一筆，不是歷史序列——2026-09-02 應 bff-ts/web-nuxt 要求新增，給估值排行卡片
 *       當中性的利率參考基準用，不做投資建議。資料來源跟 `/macro/equity-risk-premium` 同一張表
 *       （`monthly_gov_bond_yield_10y`，來源是央行統計資料庫 EG43M01en，本服務只讀）；要完整
 *       歷史序列或窗口計算請改用 `/macro/equity-risk-premium`。
 *     tags:
 *       - Macro
 *     responses:
 *       200:
 *         description: 查無資料時 `yieldPct`/`asOfMonth` 是 null，`warnings` 說明原因，不會回傳錯誤狀態碼。
 */
router.get('/gov-bond-yield-10y', getGovBondYield10y);

export default router;
