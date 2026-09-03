import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getAccrualsRatio } from './controller';

const router = Router();

/**
 * @swagger
 * /cash-flow/accruals-ratio:
 *   get:
 *     summary: 計算單一公司單季應計項目比率
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的損益表、資產負債表、現金流量表資料進行計算，
 *       本服務本身不向 MOPS 抓取資料，若資料庫中查無該季資料請先透過 oingg-mops-ts 的 ingest API 抓取。
 *
 *       計算口徑（跟 ROE 同一種單季/年化/TTM 三數值結構）：
 *       - accrualsRatioQuarterly = (本季淨利 - 本季營業活動現金流量 OCF - 本季投資活動現金流量 ICF) / 本季期末總資產 * 100。
 *       - 分母用**本季期末總資產**，不是 taxonomy 原文的「平均總資產」——跟 turnoverRatio 用期末餘額同一種
 *         刻意簡化（避免多查一期資產負債表），跟 ROE/ROA 用期末權益/總資產也是同一種處理方式。
 *       - *QuarterlyAnnualized：對應單季數值簡單 x4。
 *       - *Ttm：近四季（含本季）淨利、OCF、ICF 各自加總後再算比率（分母仍是本季期末總資產），
 *         近四季資料須完整存在才會計算，否則為 null。
 *       - 數值越高代表淨利中「應計項目」（非現金認列的獲利）佔比越高，是財報品質/盈餘操縱風險的常用篩選指標，
 *         常搭配 [`ocfToNetIncome`](../ocfToNetIncome/route.ts) 一起判讀。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的最新一季
 *       （不是任一張表自己的最新一季，不同公司財報申報進度不同步，見 src/shared/sourceData/latestQuarter.ts）。
 *       只給其中一個視為無效請求（400）。查無任何一季三張表都有資料時，year/season 回傳 null。
 *     tags:
 *       - Cash Flow
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
registerCompanyRoute(router, '/accruals-ratio', getAccrualsRatio);

export default router;
