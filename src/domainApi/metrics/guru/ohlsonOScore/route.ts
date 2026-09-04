import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getOhlsonOScore } from './controller';

const router = Router();

/**
 * @swagger
 * /guru/ohlson-o-score:
 *   get:
 *     summary: 計算單一公司 Ohlson O-Score（財務危機 Logit 預警模型）
 *     description: >
 *       James Ohlson（1980）提出的財務危機預警 Logit 模型：
 *       `O = -1.32 - 0.407*SIZE + 6.03*TLTA - 1.43*WCTA + 0.0757*CLCA - 1.72*OENEG
 *       - 2.37*NITA - 1.83*FUTL + 0.285*INTWO - 0.521*CHIN`。
 *
 *       九個變數：
 *       - `SIZE = ln(總資產)`——原始論文用 GNP 物價指數平減過的資產（換算成 1968 年美元），
 *         本服務沒有對應的平減資料源，直接用未平減的總資產（千元台幣），絕對數值跟原始論文的
 *         校準基準不是同一個尺度，見下方已知限制。
 *       - `TLTA = 總負債 / 總資產`
 *       - `WCTA = (流動資產 - 流動負債) / 總資產`
 *       - `CLCA = 流動負債 / 流動資產`
 *       - `OENEG`：總負債 > 總資產記 1（權益為負），否則記 0
 *       - `NITA = 淨利（TTM） / 總資產`
 *       - `FUTL = 營運現金流（TTM） / 總負債`——FFO（Funds From Operations）財報沒有現成欄位，
 *         用營運現金流當代理變數，是常見的實務簡化
 *       - `INTWO`：今年、去年 TTM 淨利都是負數記 1，否則記 0
 *       - `CHIN = (今年 TTM 淨利 - 去年 TTM 淨利) / (|今年| + |去年|)`
 *
 *       `probabilityOfBankruptcy = 1 / (1 + e^(-O))`，Logit 模型的標準機率轉換；`flagged`
 *       （`probabilityOfBankruptcy > 0.5`，等同 `oScore > 0`）是原始論文定的門檻，不是本服務自訂。
 *
 *       **已知限制**：模型係數是用 1970 年代美國上市公司資料（含 SIZE 用 1968 年美元平減）校準的，
 *       套用到台股時 SIZE 這個變數的絕對尺度已經跟原始校準基準完全不同（幣別、年代、有沒有平減都
 *       不一樣），`probabilityOfBankruptcy` 的絕對值不宜直接當成真實違約機率，比較適合當作同一套
 *       公司隨時間變化的相對趨勢指標，跟 `Altman_Z_Score`/`Beneish_M_Score`/`Zmijewski_Score`
 *       的已知限制是同一種性質。
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
 *         description: 民國年，選填（不給就自動抓「這家公司資產負債表/損益表/現金流量表都有資料」的最新一季，需與 season 成對）
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
registerCompanyRoute(router, '/ohlson-o-score', getOhlsonOScore);

export default router;
