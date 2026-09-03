import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getZmijewskiScore } from './controller';

const router = Router();

/**
 * @swagger
 * /guru/zmijewski-score:
 *   get:
 *     summary: 計算單一公司 Zmijewski Score（財務危機 Probit 預警模型）
 *     description: >
 *       Mark Zmijewski（1984）提出的財務危機預警 Probit 模型：
 *       `X = -4.3 - 4.5*(淨利 TTM/總資產) + 5.7*(總負債/總資產) - 0.004*(流動資產/流動負債)`。
 *
 *       跟 `Altman_Z_Score`/`Piotroski_F_Score`/`Beneish_M_Score` 同一種「以特定學者命名的複合
 *       財務比率模型」，架構單純——三個變數都是財報衍生比率，不需要跨公司比較或前瞻性假設，
 *       淨利用 TTM（近四季加總），總資產/總負債/流動資產/流動負債用本季期末資產負債表數字。
 *
 *       `probabilityOfDistress` 是把原始分數 X 用標準常態累積分布函數（Φ）轉成 0~1 的機率，
 *       比單看沒有直覺單位的 X 好解讀；`flagged`（`probabilityOfDistress > 0.5`，等同 `xScore > 0`）
 *       是原始論文定的門檻，不是本服務自訂。
 *
 *       **已知限制**：模型係數是用 1970~80 年代美國上市公司資料校準的，套用到台股時絕對數值的
 *       校準基準已經過時且跨國/跨幣別，`probabilityOfDistress` 的絕對值不宜直接當成真實違約機率，
 *       比較適合當作同一套公司隨時間變化的相對趨勢指標，跟 `Altman_Z_Score`/`Beneish_M_Score`
 *       的已知限制是同一種性質。
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
 *         description: 民國年，選填（不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季，需與 season 成對）
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
registerCompanyRoute(router, '/zmijewski-score', getZmijewskiScore);

export default router;
