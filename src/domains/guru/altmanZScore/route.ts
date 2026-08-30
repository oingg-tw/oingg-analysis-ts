import { Router } from 'ultimate-express';
import { getAltmanZScore } from './controller';

const router = Router();

/**
 * @swagger
 * /guru/altman-z-score:
 *   get:
 *     summary: 計算單一公司原始版 Altman Z-Score（破產風險預警）
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的資產負債表、損益表資料，加上 mops 的
 *       `daily_stock_price`（股價）計算，本服務本身不向任何來源抓取資料。
 *
 *       **適用性警告**：原始版模型是用上市製造業樣本校準的，X5（營收/總資產）對產業結構特別敏感，
 *       套用到非製造業（金融、服務、營建等）時分數僅供參考，不是精確的破產風險預測——這個警告
 *       固定出現在 `warnings` 裡，不是條件式的。
 *
 *       計算口徑：
 *       - `Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 0.999*X5`（原始版係數，跟 Z''-Score 不同，本服務只做原始版）。
 *       - X1 = (流動資產 − 流動負債) / 總資產；X2 = 保留盈餘 / 總資產；X3 = EBIT（TTM） / 總資產；
 *         X4 = 股權市值 / 總負債帳面值；X5 = 營收（TTM） / 總資產。
 *       - X3、X5 直接引用 [`interestCoverage`](../../solvency/interestCoverage/route.ts)、
 *         [`turnoverRatio`](../../turnover/turnoverRatio/route.ts) 已經算好的 TTM 數值，不重複查詢。
 *       - X4 的市值 = mops `daily_stock_price` 收盤價（報告日或之前最近一個交易日） x 流通股數
 *         （`capital_stock_history`，報告日當下生效的股本）——**`daily_stock_price` 覆蓋率會持續
 *         成長**（2026-08-28 是 7 家種子公司：2330/2412/2881/2887/2838/2850/2867），不在覆蓋
 *         範圍內的公司 X4 會是 `null`，`fieldStatuses` 標成 `not_applicable`。
 *       - 判讀切點：`Z > 2.99` 為 Safe，`1.81 ≤ Z ≤ 2.99` 為 Grey，`Z < 1.81` 為 Distress。
 *       - `year`/`season` 選填但要成對——不給就自動抓最新一季有資產負債表資料的季度；市值抓的是
 *         「該季報告日或之前最近一個交易日」的收盤價，不是查詢當下的最新股價。
 *     tags:
 *       - Guru
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: 公司代號（目前只有 7 家種子公司能算出完整 Z-Score，其他公司 X4 會是 null）
 *         example: "2330"
 *       - in: query
 *         name: year
 *         schema:
 *           type: string
 *         description: 選填，民國年；跟 season 要嘛都給要嘛都不給，不給就自動抓最新一季
 *         example: "115"
 *       - in: query
 *         name: season
 *         schema:
 *           type: string
 *           enum: ["1", "2", "3", "4"]
 *         description: 選填，季度；跟 year 要嘛都給要嘛都不給
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
 *           計算結果。若查無資料、不適用、或算不出有意義的值，對應欄位會是 null，
 *           `fieldStatuses` 會標明原因分類，`warnings` 是人類可讀的完整說明，
 *           不會回傳錯誤狀態碼（因為這些都是正常情境，非伺服器錯誤）。
 *       400:
 *         description: 請求的參數格式錯誤（例如只給 year 沒給 season）。
 */
router.get('/altman-z-score', getAltmanZScore);

export default router;
