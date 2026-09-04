import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getRoic } from './controller';

const router = Router();

/**
 * @swagger
 * /profitability/roic:
 *   get:
 *     summary: 計算單一公司單季投入資本回報率（ROIC）
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的損益表與資產負債表資料進行計算，本服務本身不向 MOPS 抓取資料，
 *       若資料庫中查無該季資料請先透過 oingg-mops-ts 的 ingest API 抓取。
 *
 *       計算口徑（跟 ROE/ROA 同一種單季/年化/TTM 三數值結構）：
 *       - roicQuarterlyPct = 本季 NOPAT / 本季期末投入資本（Invested Capital） * 100。
 *       - NOPAT（稅後淨營業利潤） = EBIT x (1 - 有效稅率)；EBIT = 稅前淨利 + 利息費用（跟
 *         [`interestCoverage`](../../solvency/interestCoverage/route.ts) 算法一致）；
 *         有效稅率 = 本季所得稅費用 / 本季稅前淨利，**稅前淨利為零或負數時無法計算**（有效稅率沒有意義）。
 *       - 投入資本 = 有息負債（短期借款+應付公司債+長期借款，口徑跟
 *         [`deRatio`](../../solvency/deRatio/route.ts) 一致） + 權益 - 現金及約當現金，用期末餘額，
 *         不是平均值，跟 ROE 用期末權益同一種刻意簡化。扣除現金是常見做法，排除非用於營運的超額現金部位。
 *       - *QuarterlyAnnualized：對應單季數值簡單 x4。
 *       - *Ttm：近四季（含本季）各季 NOPAT 加總 / 本季期末投入資本，任一季無法計算 NOPAT 就視為不齊，回傳 null。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
 *       （不是任一張表自己的最新一季，不同公司財報申報進度不同步，見 src/shared/sourceData/latestQuarter.ts）。
 *       只給其中一個視為無效請求（400）。查無任何一季兩張表都有資料時，year/season 回傳 null。
 *     tags:
 *       - Profitability
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
registerCompanyRoute(router, '/roic', getRoic);

export default router;
