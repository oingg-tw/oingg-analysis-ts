import { Router } from 'ultimate-express';
import { getNetDebtToEbitda } from './controller';

const router = Router();

/**
 * @swagger
 * /solvency/net-debt-to-ebitda:
 *   get:
 *     summary: 計算單一公司單季淨負債對 EBITDA 比（簡易年化、TTM 兩種數值）
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的資產負債表、損益表、現金流量表資料進行計算，
 *       本服務本身不向 MOPS 抓取資料，若資料庫中查無該季資料請先透過 oingg-mops-ts 的 ingest API 抓取。
 *
 *       這是第一個同時需要查三張財報表的指標：資產負債表算淨負債（存量），損益表+現金流量表算 EBITDA（流量）。
 *
 *       計算口徑：
 *       - 淨負債 = 有息負債（shortTermBorrowings + bondsPayable + longTermBorrowings） - 現金及約當現金（cashAndEquivalents）。
 *         可能是負數，代表淨現金部位而非淨負債。三個有息負債欄位任一為 null 視為 0（沒有借那種負債），不是資料缺漏。
 *       - EBIT = 稅前淨利（profitBeforeTax） + 利息費用（financeCosts）。
 *       - EBITDA = EBIT + 折舊（depreciation） + 攤銷（amortization），折舊/攤銷來自現金流量表的間接法加回項目。
 *       - 淨負債（存量）對「一年份」EBITDA（流量）的比率，taxonomy 只支援 TTM/FY，不支援單季——
 *         拿淨負債除以一季的 EBITDA 沒有標準意義，所以只提供 netDebtToEbitdaQuarterlyAnnualized
 *         （本季 EBITDA 簡單 x4）跟 netDebtToEbitdaTtm（近四季 EBITDA 實際加總）兩種口徑。
 *       - TTM：近四季（含本季）EBITDA 各自加總，一季只要稅前淨利/利息費用/折舊/攤銷任一為 null 就視為該季不齊，
 *         近四季資料須完整存在才會計算 TTM 版本，否則為 null。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的最新一季
 *       （不是任一張表自己的最新一季，不同公司財報申報進度不同步，見 src/shared/latestQuarter.ts）。
 *       只給其中一個視為無效請求（400）。查無任何一季三張表都有資料時，year/season 回傳 null。
 *     tags:
 *       - Solvency
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
router.get('/net-debt-to-ebitda', getNetDebtToEbitda);

export default router;
