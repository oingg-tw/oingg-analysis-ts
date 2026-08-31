import { Router } from 'ultimate-express';
import { getMarketRatios } from './controller';

const router = Router();

/**
 * @swagger
 * /valuation/market-ratios:
 *   get:
 *     summary: 查詢單一公司最新（或指定日期）的 PER、PBR、股利殖利率（直接採用 oingg-twse 已算好的數字）
 *     description: >
 *       這支 API 不自己計算 PER/PBR/殖利率，而是直接讀取 oingg-twse 資料庫的 daily_valuation 表
 *       （2026-08-19 拍板決定：直接採用現成數字，不用本服務自己的 EPS/BVPS 重算）。
 *
 *       **跟本服務其他指標不同，這支 API 不是季度查詢**——PER/PBR 是逐日的市場資料，跟財務季度不是
 *       同一種時間刻度，所以查詢介面只有 `companyId`（+ 選填的 `date`），沒有 `year`/`season`/
 *       `dataType`/`subsidiaryCompanyId`。第一版設計曾經誤把這支 API 套進其他指標的季度查詢模板，
 *       把 PER/PBR 綁在「該季報告日當天」的股價上，結果因為市場資料起始日晚於任何已報過的季度，
 *       永遠查不到資料，後來才改成現在這個設計。
 *
 *       查詢邏輯：不指定 `date` 就抓整張 daily_valuation 表最新一筆；指定 `date` 則找「該日期或之前」
 *       最新一筆交易日資料（指定日期不一定是交易日，例如週末），回應的 `tradeDate` 會標明實際套用的是哪一天。
 *
 *       **重要警告**：peRatio/pbRatio/dividendYieldPct 是 oingg-twse 算好的數字，本服務不知道
 *       對方 EPS 用的是單季、TTM 還是年度口徑——是外部黑盒數字，跟本服務自己算的 EPS
 *       （GET /profitability/eps）、BVPS（GET /profitability/bvps）口徑不保證一致，
 *       不要拿來互相驗證或混用。這個警告固定會出現在回應的 warnings 裡。
 *     tags:
 *       - Valuation
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: 公司代號
 *         example: "2330"
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: 選填，格式 YYYY-MM-DD；不給就抓最新一筆
 *         example: "2026-08-17"
 *     responses:
 *       200:
 *         description: >
 *           計算結果。若資料庫查無資料或關鍵欄位為 null，對應欄位會是 null，
 *           原因會列在 warnings 中，不會回傳錯誤狀態碼（因為「查無資料」是正常情境，非伺服器錯誤）。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/market-ratios', getMarketRatios);

export default router;
