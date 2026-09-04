import { Router } from 'ultimate-express';
import { getCompanies, getCompanyProfile } from './controller';

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
 *       且 TypeScript 會在編譯期強制 handler 的回傳型別要有 symbol）。這支端點還留著，
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
 * /companies/profile:
 *   get:
 *     summary: 單一公司基本資料（董事長/總經理/發言人/設立上市日期/資本額等）
 *     description: >
 *       2026-09-02 應 bff-ts 要求新增，給個股詳情頁的公司基本資料卡片用。company_profile
 *       這張表本來就有完整欄位（本服務之前只選了 symbol/name/shortName 三個），這支端點是
 *       把已經在資料庫裡的資料選出來對外提供，不是新的資料源整合。
 *
 *       上市（TWSE）查無資料再查上櫃（TPEx），兩邊都查無資料回傳 404。TWSE/TPEx 兩邊欄位範圍
 *       不完全一樣（TPEx 沒有 englishAddress/industryName），沒有的欄位回傳 null——
 *       industryName（2026-09-02 應 web-nuxt 要求新增）TWSE 有直接透傳，TPEx 目前沒有對應
 *       欄位，故意回 null，不猜代碼對照表。指名查詢單一公司時不篩
 *       ETF/KY/興櫃/`source`or`market`（那是排行榜/清單類端點的政策，見
 *       [`GET /securities/symbols`](../securities/route.ts)），只要
 *       company_profile 裡查得到就照實回傳。
 *
 *       `paidInCapital`/`issuedShares`/`privatePlacementShares`/`preferredStockShares`
 *       是資料庫的 bigint，序列化成字串，避免 JS 數字精度問題。
 *
 *       `financialReportTypeName`（2026-09-02 應 web-nuxt 要求新增）是 `financialReportType`
 *       裸代碼（"1"/"2"）解出來的可讀名稱（個別財報／合併財報）——MOPS 沒有公開欄位字典，
 *       這個對照是跟 mops-ts 確認過的（信心度高但非官方白紙黑字文件），未知代碼回 null。
 *     tags:
 *       - System
 *     parameters:
 *       - in: query
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *         description: 公司代號
 *         example: "2330"
 *     responses:
 *       200:
 *         description: 公司基本資料。
 *       400:
 *         description: 缺少 symbol。
 *       404:
 *         description: 查無此公司代號（上市、上櫃都查不到）。
 */
router.get('/companies/profile', getCompanyProfile);

export default router;
