import { Router } from 'ultimate-express';
import { getDebtRatio } from './controller';

const router = Router();

/**
 * @swagger
 * /solvency/debt-ratio:
 *   get:
 *     summary: 計算單一公司單季負債比率
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的資產負債表資料進行計算，本服務本身不向 MOPS 抓取資料，
 *       若資料庫中查無該季資料請先透過 oingg-mops-ts 的 ingest API 抓取。
 *
 *       計算口徑：
 *       - debtRatioPct = 本季期末總負債（totalLiabilities） / 本季期末總資產（totalAssets） x 100。
 *       - 純資產負債表的時點快照，不像 ROE/ROA 有單季/年化/TTM 的區別——資產負債表是某一天的餘額，
 *         沒有「近四季加總」這種概念可以套用。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司資產負債表有資料」的最新一季
 *       （不是任一張表自己的最新一季，不同公司財報申報進度不同步，見 src/shared/latestQuarter.ts）。
 *       只給其中一個視為無效請求（400）。查無任何一季有資料時，year/season 回傳 null。
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
router.get('/debt-ratio', getDebtRatio);

export default router;
