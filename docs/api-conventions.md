# analysis-ts 對外 API 慣例

2026-10-08 由 analysis-ts、業務中台（原名 bff-ts，2026-10-08 改名；repo oingg-tw/oingg-business-ts）、web-nuxt 三方一起定的。適用於 analysis-ts 對業務中台提供的所有端點。
**新端點一律照這份做；既有端點不做破壞性改動，只新增欄位**（破壞性改動的流程見「變更管理」）。
合約的機器可讀版本：`GET /openapi.json`（要帶 X-Api-Key），業務中台在 CI 對它做 diff。

## 錯誤：RFC 9457 problem+json

所有 4xx／5xx 都是同一個形狀，`Content-Type: application/problem+json`，跟業務中台對 web-nuxt 的格式完全相同。

| 成員 | 內容 |
|---|---|
| `type` | 有 `code` 時是 `tag:oingg.com,2026:<code，底線換連字號>`，否則 `about:blank` |
| `title` | HTTP 狀態碼的標準短語（`Bad Request`、`Not Found`…），同一個 status 永遠相同 |
| `status` | 等於 HTTP 狀態碼 |
| `detail` | 給人看的說明，措辭會變，**不要解析** |
| `instance` | `urn:uuid:<request id>`。呼叫端送 `X-Request-Id` 就沿用，回應 header 也會帶同一個值，回報問題時引用它 |
| `code` | 只在呼叫端需要分支時才有：`unknown_metric`、`unsupported_timeframe`。之後可能新增值，未知的值要放行。**三個服務的 code 一律小寫加底線**（2026-10-08 使用者拍板，既有的大寫代碼也改），跟 `type` 的 tag URI 一一對應（底線換連字號） |
| `errors` | 參數驗證失敗（400）才有：body 欄位 `{ detail, pointer: "#/columns/0/field" }`，query／path 參數 `{ detail, parameter: "metricCode" }` |
| `message` | **過渡期欄位**，業務中台改讀 `detail`／`errors` 後移除。驗證錯誤時是第一個欄位的訊息，其他錯誤等於 `detail` |

狀態碼：
- 400：參數格式錯誤、缺參數、參數值不合法。
- 401：沒帶或帶錯 X-Api-Key。
- 404：只用在「路由不存在」與少數既有的「代號不存在」端點。
- 429：限流，附 `Retry-After`。
- 500：正式環境 `detail` 是固定文字，用 `instance` 對 log。
- 503：`/health` 的資料庫檢查失敗。

## 「沒有值」的四種意思

| 情況 | 回應 |
|---|---|
| 參數不支援（例如這支指標沒有這個 timeframe） | 400 ＋ `code: unsupported_timeframe` |
| 從未計算、沒有資料 | 200 ＋ 空清單（或 `found: false`），不用 404 |
| 有計算但算不出來（資料不足、不適用、分母 ≤ 0） | 200 ＋ `value: null` ＋ `nullReason` |
| 真的是 0 | `value: 0`；null 永遠不代表 0 |

歷史類回應帶 `coverage: { from, to }`：最早／最晚**有值**的一期，不受 limit 影響。前端用它判斷「資料從哪開始」，不要把截斷當成事實。

## 每股數字的換算基準

- 每股類指標（`/metrics` 裡標 `perShare` 的，如 eps、bvps）在歷史回應裡已換算到**今天的股數基準**（分割、配股、股數合併式減資追溯），
  每一列帶 `restated`（這一期有沒有真的換算）與 `shareBasisDate`（換算基準日＝查詢當天，台北日期）。
- 股價（stockPrice）、比值（peRatio、pbRatio）**不換算**，是當時的值。兩者相除會差一個倍數。
  要畫「股價 vs 每股數字 × 倍數」，請用 `GET /companies/valuation-river`。

## 資料格式

| 項目 | 慣例 |
|---|---|
| 公司代號 | query 參數 `symbol` |
| 清單欄位 | `entries` |
| 分頁 | `limit`／`offset` ＋ `count`；時間序列「最近 N 期」用 `limit` ＋ `total`／`hasMore` |
| 日期 | 日 `YYYY-MM-DD`、月 `YYYY-MM`，欄位名稱帶語意（`tradeDate`、`knowledgeDate`…）；年份一律西元 |
| 大整數（股數、金額） | 字串 |
| 百分比 | 數值是百分比單位（2 ＝ 2%），新欄位名稱帶 `Pct` |
| 排序參數 | `order: asc \| desc` |
| 選填參數 | 沒給就是預設值；預設值改變算破壞性改動 |

## 快取：GET /data-version

回傳 `{ global, catalog, metrics: { [metricCode]: string } }`，伺服器端每 60 秒更新一次。
- 把對應的版本放進快取鍵：重算後版本會變、快取自然失效，不需要人工清快取通知。
- `catalog` 是 `GET /metrics` 內容的雜湊，指標目錄有任何改動就會變，可以用它輪詢目錄。
- 版本字串只拿來比對相不相等，不要解析。

## 健康檢查：GET /health

- 不需要 X-Api-Key。
- 會對 analysis 資料庫跑一個最小查詢（3 秒逾時）：正常 200 `{ status: "ok", database: "ok" }`，失敗 503 problem+json。
- 正式環境常駐 1 個執行個體，不會冷啟動；開發環境閒置後第一個請求可能要十幾秒。

## 使用者可見文字

- 定義、方法類文字留在 analysis-ts，web-nuxt 直接顯示，不另外維護一份：`name`、`formulaNote`、`basisNote`、溯源表的 `methodologyNote` 等。
- 介面文字、錯誤訊息、價值判斷類的標籤由 web-nuxt 自己寫。
- analysis-ts 的使用者可見文字一律照禁用詞清單掃（便宜、合理、昂貴、偏低、偏高等），也不寫「本站採用／定義」。
  清單的**唯一來源**是 web-nuxt 的 `shared/utils/compliance-words.ts`，不另外維護副本，掃之前去讀那一份。

## 變更管理

**不算破壞性**，直接上線並在通知中列出：
- 新增選填欄位
- 新增端點
- 回應裡新增 enum 值（業務中台承諾放行未知值）

**破壞性改動**：預告、新舊並存至少 14 天、附 `GET /openapi.json` 的 diff。包括：
- 刪除或改名欄位、參數、指標代碼（指標改名時 `/metrics` 會標出新代碼與停用日期）
- 必填變可為空
- 原本 200 的情況改回 4xx
- 預設值改變
- **單位、尺度或語意改變但形狀相同**：最危險，web-nuxt 會直接顯示，一定要提前講

**通知要寫清楚**：
- 已部署到哪個環境、哪個版本（開發：`oingg-analysis-ts-dev-<commit>`）。
- 每個新 enum 值與子物件的形狀。
- 證據等級：量到的、推論的。
