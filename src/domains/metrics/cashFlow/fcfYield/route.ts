import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getFcfYield } from './controller';

const router = Router();

/**
 * @swagger
 * /cash-flow/fcf-yield:
 *   get:
 *     summary: 計算單一公司自由現金流殖利率（FCF_Yield）
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的現金流量表資料，加上 oingg-twse 的 `daily_price`
 *       （股價）計算，本服務本身不向任何來源抓取資料。
 *
 *       計算口徑：
 *       - `FCF_Yield = 每股自由現金流 / 股價 x 100%`。跟 [`../../valuation/pFcf/`](../../valuation/pFcf/route.ts)
 *         互為倒數關係（`FCF_Yield = 1 / P_FCF x 100%`），但這裡直接用每股數字對股價，不用重建
 *         市值/總額，也不需要流通股數，比 P_FCF 少查一次 `capital_stock_history`。
 *       - 每股自由現金流直接引用 [`../cashFlowPerShare/`](../cashFlowPerShare/route.ts) 已經算好的
 *         單季年化、TTM 數值，不重複查詢。
 *       - 股價 = oingg-twse `daily_price` 收盤價（財報公告日或之前最近一個交易日）。股價基準優先用
 *         財報實際**公告日**（`financial_report_announcement.announcementDate`），查無公告日才退回
 *         財報期末日並在 `warnings` 註明可能有 look-ahead bias，見
 *         [`../../../../shared/sourceData/reportAnnouncementDate.ts`](../../../../shared/sourceData/reportAnnouncementDate.ts)。
 *       - **覆蓋率會持續成長**（6 家種子公司 2330/2881/2867/2801/2207/2855 回填了約 5 年歷史，
 *         其他公司多半只有近幾個月），不在覆蓋範圍內的公司會是 `null`，`fieldStatuses` 標成 `not_applicable`。
 *       - `year`/`season` 選填但要成對——不給就自動抓「這家公司現金流量表有資料」的最新一季。
 *     tags:
 *       - CashFlow
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
registerCompanyRoute(router, '/fcf-yield', getFcfYield);

export default router;
