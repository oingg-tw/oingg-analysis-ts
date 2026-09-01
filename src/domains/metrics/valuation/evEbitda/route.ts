import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getEvEbitda } from './controller';

const router = Router();

/**
 * @swagger
 * /valuation/ev-ebitda:
 *   get:
 *     summary: 計算單一公司企業價值倍數（EV_EBITDA）
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的資產負債表、損益表、現金流量表資料，加上 oingg-twse 的
 *       `daily_price`（股價）計算，本服務本身不向任何來源抓取資料。
 *
 *       計算口徑：
 *       - `EV_EBITDA = 企業價值 / EBITDA`；`企業價值（EV） = 市值 + 淨負債`（本季期末淨負債，可能是
 *         負數代表淨現金部位，此時 EV 會小於市值）。拿企業價值除以「一季」的 EBITDA 沒有標準意義，
 *         所以只提供 `evToEbitdaQuarterlyAnnualized`（本季 EBITDA 簡單 x4）跟 `evToEbitdaTtm`
 *         （近四季實際加總）兩種口徑，沒有純單季版本——跟 [`../psr/`](../psr/route.ts)、
 *         [`../pFcf/`](../pFcf/route.ts) 同一種道理。
 *       - 淨負債、EBITDA 直接引用 [`netDebtToEbitda`](../../solvency/netDebtToEbitda/route.ts) 已經
 *         算好的單季/TTM 數值，不重複查詢；該服務同時需要資產負債表（淨負債）、損益表+現金流量表
 *         （EBITDA），所以本指標也是同時需要三張財報表的季度資料。
 *       - 市值 = oingg-twse `daily_price` 收盤價（財報公告日或之前最近一個交易日） x 流通股數
 *         （mops `capital_stock_history`，公告日當下生效的股本）。股價基準優先用財報實際**公告日**
 *         （`financial_report_announcement.announcementDate`），查無公告日才退回財報期末日並在
 *         `warnings` 註明可能有 look-ahead bias，見 [`../../../../shared/sourceData/reportAnnouncementDate.ts`](../../../../shared/sourceData/reportAnnouncementDate.ts)。
 *       - **覆蓋率會持續成長**（6 家種子公司 2330/2881/2867/2801/2207/2855 回填了約 5 年歷史，
 *         其他公司多半只有近幾個月），不在覆蓋範圍內的公司會是 `null`，`fieldStatuses` 標成 `not_applicable`。
 *       - `year`/`season` 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的最新一季。
 *     tags:
 *       - Valuation
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: 公司代號（6 家種子公司歷史深度最完整，其他公司覆蓋率會持續成長）
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
 *           `fieldStatuses` 會標明原因分類，`warnings` 是人類可讀的完整說明，
 *           不會回傳錯誤狀態碼（因為「查無資料」是正常情境，非伺服器錯誤）。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
registerCompanyRoute(router, '/ev-ebitda', getEvEbitda);

export default router;
