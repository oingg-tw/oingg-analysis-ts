import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getOwnerEarnings } from './controller';

const router = Router();

/**
 * @swagger
 * /guru/owner-earnings:
 *   get:
 *     summary: 計算單一公司每股股東盈餘（Buffett Owner Earnings Per Share）
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的損益表與現金流量表資料進行計算，本服務本身不向 MOPS 抓取資料，
 *       若資料庫中查無該季資料請先透過 oingg-mops-ts 的 ingest API 抓取。
 *
 *       計算口徑（跟 [`cashFlowPerShare`](../../cashFlow/cashFlowPerShare/route.ts) 同一種單季/年化/TTM
 *       三數值結構）：
 *       - ownerEarningsPerShareQuarterly = (本季淨利 + 本季折舊 + 本季攤銷 + 本季資本支出) x 1000 / 流通股數。
 *       - capitalExpenditures 在資料庫裡本身是負數（現金流出），所以是加不是減——跟 FCF 同一個坑。
 *       - **taxonomy 原文的股東盈餘是公司總額，本服務改成每股版本**：跟 FCF 一樣接續 EPS/BVPS/每股營收/
 *         每股現金流那條「每股基礎指標」脈絡，方便跟其他每股指標互相比較。
 *       - 用「總資本支出」代替 taxonomy 定義的「維護性資本支出」（Maintenance CapEx）——財報沒有拆分
 *         維護性/成長性資本支出，這是跟 FCF 一樣的簡化，算出來的數值會比嚴格定義的股東盈餘保守（偏低）。
 *       - *QuarterlyAnnualized：對應單季數值簡單 x4。
 *       - *Ttm：近四季（含本季）淨利、折舊、攤銷、資本支出各自加總後再除以流通股數，
 *         近四季資料須完整存在才會計算，否則為 null。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司損益表跟現金流量表都有資料」的最新一季
 *       （不是任一張表自己的最新一季，不同公司財報申報進度不同步，見 src/shared/sourceData/latestQuarter.ts）。
 *       只給其中一個視為無效請求（400）。查無任何一季兩張表都有資料時，year/season 回傳 null。
 *     tags:
 *       - Guru
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
registerCompanyRoute(router, '/owner-earnings', getOwnerEarnings);

export default router;
