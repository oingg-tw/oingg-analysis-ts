import { Router } from 'ultimate-express';
import { getDupont } from './controller';

const router = Router();

/**
 * @swagger
 * /profitability/dupont:
 *   get:
 *     summary: 計算單一公司杜邦分析（3 步拆解 ROE）
 *     description: >
 *       本服務第二個純組裝型複合指標（第一個是 [`sgr`](../sgr/route.ts)）——不自己查資料庫，
 *       而是直接呼叫已經寫好的 `calculateMargins`（[`../margins/service.ts`](../margins/service.ts)）、
 *       `calculateTurnoverRatio`（[`../../turnover/turnoverRatio/service.ts`](../../turnover/turnoverRatio/service.ts)）、
 *       `calculateRoe`（[`../roe/service.ts`](../roe/service.ts)），取三者算出來的值直接套公式——不重複
 *       實作損益表/資產負債表查詢邏輯。副作用是呼叫這支 API 時，`margins`/`turnoverRatio`/`roe`
 *       三支服務也會各自照常把自己的結果 upsert 進對應的表，這是預期行為。
 *
 *       **杜邦分析法不是「大師指標」**：不是某個投資人/學者提出、帶有主觀判斷的複合公式，是杜邦公司
 *       （企業，不是個人）發展出來的標準拆解技巧，所以歸類在 `profitability`，不是 `guru`。
 *
 *       計算口徑：
 *       - `ROE = 淨利率 x 總資產週轉率 x 權益乘數`（3 步版，不是拆到稅負擔/利息負擔的 5 步版）。
 *       - 權益乘數 = 總資產 / 權益，純資產負債表時點快照，單季/TTM 共用同一個值
 *         （跟 ROE 用期末權益、不分單季/TTM 是同一個道理）。
 *       - `decomposedRoeQuarterlyPct`/`decomposedRoeTtmPct` 是用三個因子重新相乘組裝出來的 ROE，
 *         理論上應該等於（或極接近）`roe/` 直接算出來的 `actualRoeQuarterlyPct`/`actualRoeTtmPct`——
 *         兩者對照著看可以互相驗證杜邦拆解跟 ROE 計算邏輯是否一致，小數點誤差是四捨五入造成的正常現象。
 *     tags:
 *       - Profitability
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
 *         required: true
 *         schema:
 *           type: string
 *         description: 民國年
 *         example: "115"
 *       - in: query
 *         name: season
 *         required: true
 *         schema:
 *           type: string
 *           enum: ["1", "2", "3", "4"]
 *         description: 季度
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
router.get('/dupont', getDupont);

export default router;
