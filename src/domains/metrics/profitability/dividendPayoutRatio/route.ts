import { Router } from 'ultimate-express';
import { getDividendPayoutRatio } from './controller';

const router = Router();

/**
 * @swagger
 * /profitability/dividend-payout-ratio:
 *   get:
 *     summary: 計算單一公司配息率（TTM）
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的損益表與現金流量表資料進行計算，本服務本身不向 MOPS 抓取資料，
 *       若資料庫中查無該季資料請先透過 oingg-mops-ts 的 ingest API 抓取。
 *
 *       計算口徑：
 *       - **只提供 TTM 口徑，沒有單季版本**：現金股利通常一年只發放一到兩次，不是每季平均發放，
 *         單季配息率會因為「剛好有沒有發股利的那一季」劇烈失真，近四季加總才是有意義的年度口徑。
 *       - payoutRatioTtm（配息率） = |近四季現金股利發放（dividendsPaid）加總| / 近四季淨利加總 * 100。
 *       - 現金股利發放某一季缺值（null）視為 0（該季沒有發放），不是資料缺漏；只有淨利缺漏才會讓
 *         TTM 視為不齊，這點跟 deRatio/netDebtToEbitda 的有息負債欄位處理邏輯一致。
 *       - 近四季淨利加總為零或負數時無法計算（分母須為正）。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司損益表跟現金流量表都有資料」的最新一季
 *       （不是任一張表自己的最新一季，不同公司財報申報進度不同步，見 src/shared/sourceData/latestQuarter.ts）。
 *       只給其中一個視為無效請求（400）。查無任何一季兩張表都有資料時，year/season 回傳 null。
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
router.get('/dividend-payout-ratio', getDividendPayoutRatio);

export default router;
