import { Router } from 'ultimate-express';
import { getEtfRanking } from './controller';

const router = Router();

/**
 * @swagger
 * /market/etf-ranking:
 *   get:
 *     summary: ETF 排行
 *     description: >
 *       取最新一個月份的 ETF 快照資料排行（來源：sitca-ts 的 etf_basic_info/
 *       etf_monthly_statement/etf_performance）。`metric` 決定依哪個數字排序：
 *
 *       - `aum`：規模（新台幣）
 *       - `holders`：受益人數
 *       - `netFlow`：淨申購（申購金額 - 贖回金額，本服務計算，不是來源現成欄位）
 *       - `dcaAmount`：定期定額申購金額
 *       - `return3m`/`return6m`/`return1y`/`return2y`/`return3y`/`return5y`/`returnYtd`/`return10y`：
 *         各天期累積報酬率（百分比，不是年化報酬率）
 *       - `expenseRatio`：總費用率——只用「最新一個完整年度」（例如現在是 2026 年就用 2025 年
 *         的資料，2026 這種還沒過完的年度不拿來比），發行日期落在這個基準年度（或更晚）的
 *         ETF 因為那一年本身不滿一整年會被排除，不套用其他年度或做時間比例換算，確保每一檔
 *         都是同一個基準年比較。
 *
 *       目前 sitca-ts 只有單一個月的快照資料，還沒有累積多月，暫時無法做月增/年增這類趨勢型
 *       指標。`asOf` 標示這筆資料實際採用的月份（`YYYY-MM`）或年度（`expenseRatio` 是
 *       `YYYY`）。
 *
 *       `category`（原始分類字串，例如「上市ETF_國外成分證券ETF」）已拆成三個獨立欄位：
 *       `market`（TWSE/TPEx）、`assetClass`（國內成分證券/國外成分證券/債券成分/槓桿型/
 *       反向型/多資產/連結式，主動式 ETF 沒有這個概念時是 null）、`isActive`（是否為主動式
 *       ETF，不追蹤特定指數、經理人自訂策略操作）。
 *     tags:
 *       - Market
 *     parameters:
 *       - in: query
 *         name: metric
 *         required: true
 *         schema:
 *           type: string
 *           enum: [aum, holders, netFlow, dcaAmount, return3m, return6m, return1y, return2y, return3y, return5y, returnYtd, return10y, expenseRatio]
 *       - in: query
 *         name: order
 *         required: true
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 預設 20，上限 50。
 *     responses:
 *       200:
 *         description: 前 limit 名的 ETF 排行。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/market/etf-ranking', getEtfRanking);

export default router;
