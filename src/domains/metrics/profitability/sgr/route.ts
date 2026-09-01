import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getSgr } from './controller';

const router = Router();

/**
 * @swagger
 * /profitability/sgr:
 *   get:
 *     summary: 計算單一公司可持續成長率（SGR，TTM）
 *     description: >
 *       本服務第二個複合指標——不自己查資料庫，而是直接呼叫已經寫好的 `calculateRoe`
 *       （[`src/domains/metrics/profitability/roe/service.ts`](../roe/service.ts)）跟 `calculateDividendPayoutRatio`
 *       （[`src/domains/metrics/profitability/dividendPayoutRatio/service.ts`](../dividendPayoutRatio/service.ts)），
 *       取兩者算出來的 TTM 數值直接套公式——不重複實作查詢邏輯。副作用是呼叫這支 API 時，
 *       `roe`/`dividendPayoutRatio` 兩支服務也會各自照常把自己的結果 upsert 進
 *       `profitability_roe`/`profitability_dividend_payout_ratio`，這是預期行為。
 *
 *       計算口徑：
 *       - **只有 TTM 口徑**：因為配息率本身只提供 TTM 口徑（現金股利不是每季平均發放），SGR 自然也只有 TTM。
 *       - sgrTtm = ROE(TTM) x (1 - 配息率(TTM))。
 *       - ROE(TTM) 或配息率(TTM) 任一無法取得時，SGR 也無法計算，原因見 warnings。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的最新一季
 *       （取 roe 跟 dividendPayoutRatio 兩支底層服務各自需要的表的聯集，不是任一張表自己的最新一季，
 *       不同公司財報申報進度不同步，見 src/shared/sourceData/latestQuarter.ts），解析出來的季度會以固定值傳給
 *       底層兩支服務，不會各自重複解析。只給其中一個視為無效請求（400）。查無任何一季三張表都有資料時，
 *       year/season 回傳 null。
 *     tags:
 *       - Profitability
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: 公司代號
 *         example: "2330"
 *       - in: query
 *         name: year
 *         schema:
 *           type: string
 *         description: 民國年，選填（不給就自動抓最新一季，需與 season 成對）
 *         example: "115"
 *       - in: query
 *         name: season
 *         schema:
 *           type: string
 *           enum: ["1", "2", "3", "4"]
 *         description: 季度，選填（不給就自動抓最新一季，需與 year 成對）
 *         example: "2"
 *       - in: query
 *         name: dataType
 *         schema:
 *           type: string
 *           enum: ["1", "2"]
 *           default: "2"
 *         description: 1 = 個體, 2 = 合併，預設 2
 *       - in: query
 *         name: subsidiaryCompanyId
 *         schema:
 *           type: string
 *           default: ""
 *         description: 子公司代號，查詢母公司本身時留空
 *     responses:
 *       200:
 *         description: >
 *           計算結果。若資料庫查無資料或關鍵欄位為 null，對應欄位會是 null，
 *           原因會列在 warnings 中，不會回傳錯誤狀態碼（因為「查無資料」是正常情境，非伺服器錯誤）。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
registerCompanyRoute(router, '/sgr', getSgr);

export default router;
