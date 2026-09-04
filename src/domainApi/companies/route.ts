import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getCompanies, getCompanyProfile, getCompanyCapitalStockHistory, getCompanyMetrics } from './controller';

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
 *
 *       `website`（2026-09-04 應 web-nuxt/conductor 要求正規化）已經清成乾淨的裸網域（例如
 *       "acc.com.tw"）——原始資料至少有三種混雜格式（"www.acc.com.tw"、
 *       "http://www.ancang.com/"、"www.tactc.com.tw/"），這裡統一去掉 scheme、尾斜線、
 *       `www.` 前綴，呼叫端不用自己再清洗一次。
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

/**
 * @swagger
 * /companies/capital-stock-history:
 *   get:
 *     summary: 單一公司股本異動歷史（現金增資/盈餘轉增資/合併增資/減資等）
 *     description: >
 *       2026-09-04 應 web-nuxt 要求新增，給個股頁面「股本變化」卡片用——讓使用者對照流通
 *       股數變化跟 EPS 成長，判斷是真成長還是股本膨脹稀釋出來的假象。
 *
 *       資料來源是 mops-ts 的 `export.capital_stock_history`，**是「異動事件序列」不是
 *       固定季度/年度快照**——同一年可能有 0 筆或多筆，取決於這家公司這年有沒有真的變動
 *       股本，`entries` 依 `effectiveDate` 由新到舊排序。
 *
 *       `changeSource` 是結構化的變動原因細分（現金增資/資本公積轉增資/盈餘轉增資/合併
 *       增資/減資五種，`other` 是不屬於這五種時的自由格式文字，例如「發行限制員工權利新股
 *       2,353,000股」）。**實測過這張表沒有庫藏股/可轉債轉換的獨立結構化欄位**，這兩種
 *       異動反而是寫在 `remarks` 自由格式文字裡（例如「註銷庫藏股3,249,000股」），前端
 *       如果要呈現這兩種異動只能顯示 `remarks` 原文，無法用數字欄位精確拆解金額。
 *
 *       `sharesChangePercent` 是跟「時間序列上更早的前一筆」相比，流通股數變動的百分比
 *       （四捨五入到小數 2 位）——不是跟陣列順序的前一筆比，`entries` 本身是新到舊排序，
 *       所以是跟陣列裡的下一筆比。最早一筆（沒有更早的可以比較）是 `null`。
 *
 *       查無資料（mops 這批資料目前不是每家公司都有覆蓋）回傳 `entries: []`，是 200 不是
 *       404——404 只代表「這家公司在 company_profile 查不到」（見 `/companies/profile`），
 *       跟「查不到股本異動歷史」是兩件事，這支端點不做公司存不存在的判斷。
 *
 *       `paidInShares`/`paidInCapital`/`changeSource` 底下的數字欄位都是資料庫的 bigint，
 *       序列化成字串，避免 JS 數字精度問題。
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
 *         description: 股本異動歷史（由新到舊排序），查無資料時 `entries` 是空陣列。
 *       400:
 *         description: 缺少 symbol。
 */
router.get('/companies/capital-stock-history', getCompanyCapitalStockHistory);

/**
 * @swagger
 * /companies/metrics:
 *   get:
 *     summary: 讀取優先的單一公司 consolidated 指標查詢（domainApi 讀取優先）
 *     description: >
 *       2026-09-04 新增，取代原本 `domainApi/metrics/**` 底下 44 支「每支指標各自一個端點、
 *       每次都即時現算」的舊端點——那些端點即將刪除（BFF 已確認完全沒有呼叫）。
 *
 *       行為：先讀 `analysis` 結果表（跟 `POST /screener/values` 同一套查詢引擎），查得到就
 *       直接回傳（`source: "cache"`）；查不到（這張表根本沒有這個 symbol 的任何一列）才
 *       委派給 `domainBatch` 的現算+upsert 邏輯即時補算一次，算完寫回 `analysis` 表，
 *       下次查詢就會是 cache hit（`source: "computed"`）。真的沒有資料可算則是
 *       `source: "unavailable"`。
 *
 *       `fields` 逗號分隔，每個是 `"metricKey.fieldKey"` 格式（跟 `GET /filters` 的 catalog、
 *       `POST /screener/values` 同一套定址方式，可以先打 `GET /filters` 知道有哪些
 *       metricKey/fieldKey 可用）。**不支援** `equityRiskPremium`/`govBondYield10y`
 *       （全市場單一值，不分公司，請改打 `GET /macro/equity-risk-premium`/
 *       `GET /macro/gov-bond-yield-10y`）跟 `obv`（BigInt 型別，這次不處理，之後真的有
 *       需求再補），帶這些 key 會回 400。
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
 *       - in: query
 *         name: fields
 *         required: true
 *         schema:
 *           type: string
 *         description: 逗號分隔的 "metricKey.fieldKey" 清單，1–50 個。
 *         example: "roe.roeQuarterlyPct,margins.grossMarginPct"
 *     responses:
 *       200:
 *         description: >
 *           `{ symbol, companyName, values: { [field]: { value, asOfDate, source } } }`，
 *           每個要求的 field 都保證出現在 `values` 裡。
 *       400:
 *         description: 缺少 symbol/fields、fields 格式錯誤、或帶了不支援單一公司查詢的 field。
 */
registerCompanyRoute(router, '/companies/metrics', getCompanyMetrics);

export default router;
