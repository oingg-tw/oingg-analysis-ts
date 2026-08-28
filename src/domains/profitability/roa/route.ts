import { Router } from 'ultimate-express';
import { getRoa } from './controller';

const router = Router();

/**
 * @swagger
 * /profitability/roa:
 *   get:
 *     summary: 計算單一公司單季 ROA（資產報酬率）
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的損益表與資產負債表資料進行計算，本服務本身不向 MOPS 抓取資料，
 *       若資料庫中查無該季資料請先透過 oingg-mops-ts 的 ingest API 抓取。
 *
 *       計算口徑（跟 ROE 同一種單季/年化/TTM 三數值結構）：
 *       - 淨利欄位優先採用「歸屬於母公司」口徑（netIncomeAttributableToParent），缺漏時退回用整體數字（netIncome）——
 *         跟本服務其他指標一致，不是教科書上常見的「整體淨利對整體資產」口徑。
 *       - roaQuarterlyPct：單季（未年化）ROA = 本季淨利 / 本季期末總資產 x 100。用的是期末總資產，不是期初期末平均。
 *       - roaQuarterlyAnnualizedPct：roaQuarterlyPct 簡易年化（x4），非以近四季實際加總計算。
 *       - roaTtmPct：近四季（含本季）淨利加總 / 本季期末總資產 x 100，近四季資料須完整存在才會計算，否則為 null。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
 *       （不是任一張表自己的最新一季，不同公司財報申報進度不同步，見 src/shared/latestQuarter.ts）。
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
router.get('/roa', getRoa);

export default router;
