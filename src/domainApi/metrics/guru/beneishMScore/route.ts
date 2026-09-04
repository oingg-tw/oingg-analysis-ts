import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getBeneishMScore } from './controller';

const router = Router();

/**
 * @swagger
 * /guru/beneish-m-score:
 *   get:
 *     summary: 計算單一公司貝尼許 M 分數（法務會計造假預警，跟去年同季比較）
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的資產負債表、損益表、現金流量表資料進行計算，
 *       本服務本身不向 MOPS 抓取資料。
 *
 *       `M = -4.84 + 0.920*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI + 0.115*DEPI
 *       - 0.172*SGAI + 4.037*TATA + 0.0327*LVGI`
 *
 *       8 個變量除了 TATA（只看本季，不跟去年比較），其餘全部是「本季 vs 去年同季」的自我比較（YoY）：
 *       - DSRI 應收帳款指數、GMI 毛利率指數、AQI 資產品質指數（簡化版，沒有扣除有價證券）、
 *         SGI 營收成長指數、DEPI 折舊指數（只用 depreciation，不含 amortization）、
 *         SGAI 管銷費用指數（SGA = 推銷費用+管理費用）、LVGI 槓桿指數（簡化版，用總負債/總資產）。
 *       - **8 個變量全部能計算才給 M-Score**——任一為 `null`，`mScore` 就是 `null`。
 *       - 判別標準（原始論文門檻，不是本服務自訂）：`M-Score > -1.78` 財務造假風險較高，
 *         `M-Score <= -1.78` 財務數據可信度較高，回應的 `flagged` 欄位是這個判斷的布林值。
 *       - 「去年同季」用 `getPastNQuarters` 往前推 4 季定位，不是「上一季」。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的
 *       最新一季（不是任一張表自己的最新一季，不同公司財報申報進度不同步，見 src/shared/sourceData/latestQuarter.ts）。
 *       只給其中一個視為無效請求（400）。查無任何一季三張表都有資料時，year/season 回傳 null。
 *       這裡的自動解析只決定「本季」，YoY 比較用的「去年同季」邏輯不受影響。
 *     tags:
 *       - Guru
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
 *           計算結果。若查無資料，對應變量會是 `null`，`fieldStatuses` 會標明原因分類，
 *           `warnings` 是人類可讀的完整說明，不會回傳錯誤狀態碼（因為「查無資料」是正常情境，非伺服器錯誤）。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
registerCompanyRoute(router, '/beneish-m-score', getBeneishMScore);

export default router;
