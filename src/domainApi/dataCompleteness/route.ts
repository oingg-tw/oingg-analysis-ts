import { Router } from 'ultimate-express';
import { getDataCompleteness } from './controller';

const router = Router();

/**
 * @swagger
 * /data-completeness:
 *   get:
 *     summary: 查詢單一公司的指標資料完整度
 *     description: >
 *       直接呼叫全部 44 支「單一公司」指標的 calculate*（跟批次預算腳本共用同一份
 *       [`src/domainBatch/indicatorRegistry.ts`](../../domainBatch/indicatorRegistry.ts) 登錄檔），
 *       依照每支指標回傳的 `warnings` 陣列判斷這支指標對這家公司來說算不算完整：
 *       沒有 warnings 算 `ok`（資料齊全），有 warnings 算 `partial`（優雅降級過，部分欄位缺漏，
 *       仍是正常情境），呼叫本身丟例外才算 `unavailable`（理論上不該發生）。
 *
 *       回傳依 `src/domainApi` 的分類（profitability/cashFlow/solvency/turnover/guru/valuation/
 *       portfolio/technicals）分組統計，並給一個全部指標的整體完整度百分比。
 *
 *       **副作用**：呼叫這支 API 會讓這 44 支指標各自把這家公司的結果 upsert 進自己的表——
 *       這是預期行為，等同對這家公司單獨跑一次批次預算，不是意外。
 *
 *       `macro/equityRiskPremium`（全市場單一值，沒有 symbol）跟 `valuation/ranking`
 *       （本身是跨公司排行端點）不適用「單一公司」這個模式，不列在統計裡。
 *     tags:
 *       - System
 *     parameters:
 *       - in: query
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *         description: 公司代號
 *         example: "2330"
 *     responses:
 *       200:
 *         description: 依分類分組的完整度統計，以及整體完整度百分比。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/data-completeness', getDataCompleteness);

export default router;
