import { Router } from 'ultimate-express';
import { getEquityRiskPremium } from './controller';

const router = Router();

/**
 * @swagger
 * /macro/equity-risk-premium:
 *   get:
 *     summary: 計算歷史股權風險溢酬（Equity Risk Premium）——TAIEX 年化報酬率減同期 10 年期公債殖利率
 *     description: >
 *       歷史法（Historical Risk Premium Approach）：用 oingg-twse 的 `daily_taiex_index` 月底收盤
 *       算 TAIEX 年化報酬率，減去 CBC 的 `monthly_gov_bond_yield_10y`（10 年期政府公債次級市場殖利率）
 *       同期平均值。本服務不向任何來源抓取原始資料，只讀取兩個資料源已鏡像進資料庫的資料，若查無資料
 *       請先確認 oingg-twse / oingg-cbc-ts 那邊有沒有涵蓋所需月份。
 *
 *       **樣本窗口越長越可信**：不指定 start/end 就用「TAIEX 與無風險利率都有資料」的完整重疊區間
 *       （目前約 1999-01 至今）。2026-08-30 實測過，5 年窗口（2021-09~2026-08）算出 ERP ≈ 21%、
 *       10 年窗口（2016-06~2026-06）≈ 17%，都是台股單一段極端多頭造成的樣本偏誤，遠高於文獻常見的
 *       4%~8%；27 年窗口算出來是 5.8%（幾何）~7.9%（算術），才貼近文獻。窗口低於 20 年（240 個月）
 *       仍然會算，但 `warnings` 會提醒可信度風險，不會擋下計算。
 *
 *       計算口徑：
 *       - `marketReturnGeometric` = TAIEX 年化幾何報酬率 = `(期末收盤/期初收盤)^(12/月數) - 1`。
 *       - `marketReturnArithmetic` = TAIEX 年化算術報酬率 = `月報酬率平均 * 12`。
 *       - `avgRiskFreeRate` = 窗口內 10 年期公債殖利率的簡單平均。
 *       - `erpGeometric` / `erpArithmetic` = 對應的市場報酬率 - 無風險利率。兩者哪個更適合視用途而定
 *         （長期資本預算常建議用幾何，CAPM 單期折現率常見用算術——本服務兩者都算，不替使用者預設）。
 *       - 全部欄位是百分比數字（例如 5.80 代表 5.80%），不是小數。
 *       - 窗口內重疊月份少於 2 個月無法算出任何報酬率，`fieldStatuses` 標註 `calculation_error`。
 *       - 指定的 start/end 超出實際資料涵蓋範圍時，會裁切到實際涵蓋範圍並在 `warnings` 說明，
 *         `clippedToAvailableData` 會是 `true`。
 *     tags:
 *       - Macro
 *     parameters:
 *       - in: query
 *         name: startYear
 *         schema:
 *           type: integer
 *         description: 選填，窗口起始年（西元），要跟 startMonth 一起給
 *         example: 1999
 *       - in: query
 *         name: startMonth
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: 選填，窗口起始月，要跟 startYear 一起給
 *         example: 1
 *       - in: query
 *         name: endYear
 *         schema:
 *           type: integer
 *         description: 選填，窗口結束年（西元），要跟 endMonth 一起給
 *       - in: query
 *         name: endMonth
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: 選填，窗口結束月，要跟 endYear 一起給
 *     responses:
 *       200:
 *         description: >
 *           計算結果。若查無資料或樣本數不足，對應欄位會是 null，`fieldStatuses` 會標明原因分類，
 *           `warnings` 是人類可讀的完整說明，不會回傳錯誤狀態碼。
 *       400:
 *         description: 請求的參數格式錯誤（例如只給 startYear 沒給 startMonth）。
 */
router.get('/equity-risk-premium', getEquityRiskPremium);

export default router;
