import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getCashFlowPerShare } from './controller';

const router = Router();

/**
 * @swagger
 * /cash-flow/cash-flow-per-share:
 *   get:
 *     summary: 計算單一公司單季每股營業現金流（OCF）與每股自由現金流（FCF）
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的現金流量表與股本歷史資料進行計算，本服務本身不向 MOPS 抓取資料，
 *       若資料庫中查無該季資料請先透過 oingg-mops-ts 的 ingest API 抓取。
 *
 *       計算口徑（跟 EPS/每股營收同一種三數值結構，OCF 跟 FCF 各自都有）：
 *       - ocfPerShareQuarterly：本季營業活動現金流量（netCashFromOperatingActivities） / 本季報告日對應的流通股數。
 *       - fcfPerShareQuarterly：(本季營業活動現金流量 + 本季資本支出) / 流通股數。
 *         資料庫裡的 capitalExpenditures 本身是負數（現金流出），所以是加不是減。
 *       - *QuarterlyAnnualized：對應的單季數值簡單 x4，非以近四季實際加總計算。
 *       - *Ttm：近四季（含本季）加總 / 流通股數，近四季資料須完整存在才會計算，否則為 null——
 *         一季只要營業活動現金流量或資本支出任一為 null，該季就視為不齊，OCF 跟 FCF 共用同一組完整性判斷。
 *       - 流通股數查股本歷史（capital_stock_history）：取生效日（西元年月）小於等於本季報告日的最新一筆，
 *         不是抓整張表最新一筆——股本是會隨現金增資、盈餘轉增資、減資等變動的歷史資料。
 *       - 若指定 subsidiaryCompanyId，流通股數仍是母公司（上市櫃公司本身）的股本結構，會在 warnings 中註明。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司現金流量表有資料」的最新一季
 *       （不是任一張表自己的最新一季，不同公司財報申報進度不同步，見 src/shared/sourceData/latestQuarter.ts）。
 *       只給其中一個視為無效請求（400）。查無任何一季有資料時，year/season 回傳 null。
 *     tags:
 *       - Cash Flow
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
registerCompanyRoute(router, '/cash-flow-per-share', getCashFlowPerShare);

export default router;
