import { Router } from 'ultimate-express';
import { getCompanies, getCompanySymbols } from './controller';

const router = Router();

/**
 * @swagger
 * /companies:
 *   get:
 *     summary: 列出公司代號/名稱對照表（分頁）
 *     description: >
 *       給 bff-ts 自己快取用——2026-09-01 起，本服務多公司陣列結果（`screener`、
 *       `valuation/ranking`、`market/*-ranking` 這類）已經直接在回應裡帶 `companyName`/
 *       `name`，單一公司的一般指標 API 也會明確補上 `companyName`（見
 *       [`src/shared/registerCompanyRoute.ts`](../../shared/registerCompanyRoute.ts)，取代原本
 *       悄悄猜回應形狀的全域 middleware——現在是 route.ts 明確選擇要不要用這個函式掛路由，
 *       且 TypeScript 會在編譯期強制 handler 的回傳型別要有 companyId）。這支端點還留著，
 *       是給還沒被涵蓋到的情境、或 bff-ts 想自己維護本地快取時用，不是唯一的補名稱管道。
 *
 *       涵蓋上市（TWSE）+ 上櫃（TPEx），查不到簡稱的公司 `companyName` 會是 `null`。這是低頻
 *       異動的參考資料，建議 bff-ts 自己快取、不用每次都打。
 *
 *       2026-09-01 加上 `limit`/`offset`：`limit` 這次要拿幾筆由呼叫端自己依業務邏輯決定
 *       （例如依使用者方案給不同筆數），本服務只負責上限（1000，避免一次回應過大）——要拿完
 *       全部公司，用 `count` 自己算要打幾次、搭配 `offset` 依序拉完；也提供 `countOnly=true`
 *       只回總筆數，不用先拉一批資料才知道總共幾筆。
 *     tags:
 *       - System
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 這次要拿幾筆，預設 200，上限 1000。
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         description: 跳過前面幾筆，預設 0。
 *       - in: query
 *         name: countOnly
 *         schema:
 *           type: boolean
 *         description: true 時只回總筆數（`{ count }`），不拉實際資料。
 *     responses:
 *       200:
 *         description: >
 *           `countOnly=true` 時是 `{ count }`；否則是 `{ count, limit, offset, entries }`，
 *           `count` 一律是全部符合條件的總筆數（不是這次回傳的筆數）。
 *       400:
 *         description: 請求的參數格式錯誤，或 limit 超過上限。
 */
router.get('/companies', getCompanies);

/**
 * @swagger
 * /companies/symbols:
 *   get:
 *     summary: 「真正上市/上櫃公司」代號清單（排除 ETF/衍生商品、TWSE 非交易性質登記資料）
 *     description: >
 *       2026-09-02 應 mops-ts 要求新增——他們原本要一份手動貼上去的靜態清單做全市場資料回補，
 *       靜態清單會過時、容易貼錯（已經發生過一次版本誤差），改用這支端點讓他們自己即時打，
 *       跟排行榜/screener 內部用的「排除 ETF」篩選定義（見
 *       [`src/shared/sourceData/companyProfile.ts`](../../shared/sourceData/companyProfile.ts)
 *       的 `getTwseCompanySymbolSet`/`getTpexCompanySymbolSet`）永遠同步。
 *
 *       涵蓋：TWSE 上市（`source = 'COMPANY_PROFILE'`，排除證券商登記等非交易性質的
 *       `COMPANY_PROFILE_PUBLIC`）+ TPEx 上櫃（一般上櫃跟興櫃都算，興櫃雖然沒有一般股價
 *       資料，但仍是合法登記、有公開揭露義務的公司）。回應是排序過、去重的字串陣列，
 *       不分頁（目前量級約 2,300 檔，payload 很小）。
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: "`{ count, symbols }`"
 */
router.get('/companies/symbols', getCompanySymbols);

export default router;
