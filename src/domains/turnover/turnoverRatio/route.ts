import { Router } from 'ultimate-express';
import { getTurnoverRatio } from './controller';

const router = Router();

/**
 * @swagger
 * /turnover/turnover-ratio:
 *   get:
 *     summary: 計算單一公司單季存貨/應收帳款/應付帳款/總資產/固定資產周轉率、DIO/DSO/DPO 週轉天數與 CCC 現金轉換週期
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的損益表與資產負債表資料進行計算，本服務本身不向 MOPS 抓取資料，
 *       若資料庫中查無該季資料請先透過 oingg-mops-ts 的 ingest API 抓取。
 *
 *       計算口徑（跟 ROE 同一種單季/年化/TTM 三數值結構，五個周轉率各自都有）：
 *       - inventoryTurnoverQuarterly（存貨周轉率） = 本季營業成本（operatingCost） / 本季期末存貨（inventory）。
 *       - receivablesTurnoverQuarterly（應收帳款周轉率） = 本季營收（operatingRevenue） / 本季期末應收帳款（accountsReceivable）。
 *       - assetTurnoverQuarterly（總資產周轉率） = 本季營收 / 本季期末總資產（totalAssets）。
 *       - fixedAssetTurnoverQuarterly（固定資產周轉率） = 本季營收 / 本季期末不動產、廠房及設備（propertyPlantEquipment）。
 *       - payablesTurnoverQuarterly（應付帳款周轉率） = 本季營業成本 / 本季期末應付帳款（accountsPayable）。
 *       - 分母都用**期末餘額**，不是期初期末平均——跟 ROE 用期末權益一樣的刻意簡化。
 *       - *QuarterlyAnnualized：對應單季數值簡單 x4，非以近四季實際加總計算。
 *       - *Ttm：近四季（含本季）營業成本／營收加總 / 本季期末餘額，近四季資料須完整存在才會計算，否則為 null——
 *         一季只要營業成本或營收任一為 null，該季就整個視為不齊，五個周轉率共用同一組完整性判斷。
 *
 *       DIO/DSO/DPO（週轉天數）＝ 365 / 對應的年化周轉率，只提供 *QuarterlyAnnualized/*Ttm 兩種口徑，
 *       不提供單季未年化版本（365 / 單季次數沒有有意義的解讀）：
 *       - inventoryDaysQuarterlyAnnualized/Ttm＝DIO 存貨週轉天數。
 *       - receivablesDaysQuarterlyAnnualized/Ttm＝DSO 應收帳款週轉天數。
 *       - payablesDaysQuarterlyAnnualized/Ttm＝DPO 應付帳款週轉天數。
 *       - cashConversionCycleQuarterlyAnnualized/Ttm＝CCC 現金轉換週期 = DIO + DSO − DPO。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
 *       （不是任一張表自己的最新一季，不同公司財報申報進度不同步，見 src/shared/latestQuarter.ts）。
 *       只給其中一個視為無效請求（400）。查無任何一季兩張表都有資料時，year/season 回傳 null。
 *     tags:
 *       - Turnover
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
router.get('/turnover-ratio', getTurnoverRatio);

export default router;
