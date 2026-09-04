import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getCapexToRevenue } from './controller';

const router = Router();

/**
 * @swagger
 * /turnover/capex-to-revenue:
 *   get:
 *     summary: 計算單一公司單季資本支出佔營收比（單季、TTM 兩種數值）
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的損益表與現金流量表資料進行計算，本服務本身不向 MOPS 抓取資料，
 *       若資料庫中查無該季資料請先透過 oingg-mops-ts 的 ingest API 抓取。
 *
 *       計算口徑：
 *       - capexToRevenueQuarterly = |本季資本支出（capitalExpenditures）| / 本季營收 x 100。
 *         資料庫裡 capitalExpenditures 本身是負數（現金流出），計算比率時取絕對值——資本支出佔營收比慣例上是正數百分比。
 *       - 這是「同期流量 / 同期流量」的比率，本身不需要年化，只有單季跟 TTM 兩種口徑，
 *         跟毛利率/營業利益率/稅後淨利率同一種結構。
 *       - capexToRevenueTtm = 近四季（含本季）營收/資本支出各自加總後再算比率，近四季資料須完整存在才會計算，
 *         否則為 null。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司損益表跟現金流量表都有資料」的最新一季
 *       （不是任一張表自己的最新一季，不同公司財報申報進度不同步，見 src/shared/sourceData/latestQuarter.ts）。
 *       只給其中一個視為無效請求（400）。查無任何一季兩張表都有資料時，year/season 回傳 null。
 *     tags:
 *       - Turnover
 *     parameters:
 *       - in: query
 *         name: symbol
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
registerCompanyRoute(router, '/capex-to-revenue', getCapexToRevenue);

export default router;
