import { Router } from 'ultimate-express';
import { getPiotroskiFScore } from './controller';

const router = Router();

/**
 * @swagger
 * /guru/piotroski-f-score:
 *   get:
 *     summary: 計算單一公司皮爾托斯基 F 分數（0~9 分，跟去年同季比較）
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的資產負債表、損益表、現金流量表資料進行計算，
 *       本服務本身不向 MOPS 抓取資料。
 *
 *       計算口徑：
 *       - 9 項二元訊號，全部是「本季 vs 去年同季」的自我比較（YoY），不是跟其他公司比較：
 *         1. ROA 為正（本季淨利/總資產 > 0）
 *         2. 營運現金流為正（本季 CFO > 0）
 *         3. ROA 較去年同季提升
 *         4. 盈餘品質（CFO > 本季淨利）
 *         5. 長期負債比率（長期借款/總資產）較去年同季下降
 *         6. 流動比率較去年同季提升
 *         7. 流通股數沒有較去年同季增加（無稀釋）
 *         8. 毛利率較去年同季提升
 *         9. 總資產週轉率較去年同季提升
 *       - **9 項全部能判斷才給總分**——任一項因為資料缺漏變成無法判斷，`score` 就是 `null`
 *         （不會用「幾項算出來就算幾項」湊一個打折的分數），`signals` 陣列列出每一項各自的判斷結果。
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
 *           計算結果。若查無資料，對應訊號的 `passed` 會是 `null`，`fieldStatuses` 會標明原因分類，
 *           `warnings` 是人類可讀的完整說明，不會回傳錯誤狀態碼（因為「查無資料」是正常情境，非伺服器錯誤）。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/piotroski-f-score', getPiotroskiFScore);

export default router;
