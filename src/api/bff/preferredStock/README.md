# 特別股（preferred_stock）

- **scope**：Security（特別股本身是獨立的證券，不是發行公司底下的一個欄位——例如 1101 台泥的普通股 vs 1101B 台泥乙特，是兩檔不同的證券）
- **狀態**：✅ 已實作（2026-09-06）。`GET /preferred-stocks`，見 `controller.ts`。
- **跟 `../companies/` 的關係**：`src/api/bff/companies/` 底下的端點全部假設「一家公司 + 季度財報（MOPS）+ 股價（TWSE）」這個骨架，特別股不是新公司、也沒有自己的季度損益表可以拆解，硬塞進那個心智模型會很彆扭，2026-08-31 使用者決定另外開一個平行分類。之後如果要做 REITs／ETF／興櫃／KY 股票專區，預期也會在這裡開平行的子資料夾，不是各自獨立的頂層分類。

## 三個真實資料來源（2026-09-06 直接查 export DB 重新驗證過，舊版筆記的 prisma 路徑已過時）

| 資料 | 現況 |
|---|---|
| TWSE `export.isin_securities`（`twseExportPrisma`） | `security_type = '特別股'` 篩出 28 檔目前上市中的特別股，例如 `1101B` 台泥乙特、`1312A` 國喬特。跟三大表一樣走 `$queryRawUnsafe`，沒有鏡像進 `prisma/twseExport/schema.prisma`（這張 view 沒有唯一識別欄位）。**TPEx（`tpexExportPrisma`）完全沒有這張表**，上櫃特別股（如果存在）沒有資料源，是外部缺口。 |
| TWSE `export.daily_price` | 特別股的 symbol（例如 `1101B`）跟一般股票一樣是 key，直接複用既有的 `getStockPriceAsOf`（`src/shared/sourceData/marketCap.ts`），不用新寫查詢。 |
| mops-ts `export.preferred_stock_right`（`mopsExportPrisma`） | 77 列，`preferred_stock_code` 對應 `isin_securities.symbol`（28 檔目前上市的全部對得上）。**同一個 code 會有多列**（`series_no` 遞增，代表配息條件歷次修訂），查詢時要 `ORDER BY series_no DESC LIMIT 1` 拿最新條款，不能假設一個 code 只有一列。 |

## 逐欄位資料來源對照

`GET /preferred-stocks` 的回應是三個來源攤平合併成一個物件。2026-09-07 使用者要求
API 本身要能查證來源，一開始想標內部 table 名稱，但使用者指出這對終端使用者沒有
意義（看不到也查不了我們的內部資料庫）——改成跨團隊跟 twse-ts/mops-ts 要來的**公開
查證頁面 URL**，已在回應最外層加上 `dataSources`（`[{name, url, note}, ...]`，見
`types.ts` 的 `preferredStockDataSourceSchema`）：

| `name` | `url` | 說明 |
|---|---|---|
| TWSE 國際證券辨識號碼（ISIN）一覽表 | `https://isin.twse.com.tw/isin/C_public.jsp?strMode=2` | twse-ts 實際抓取 `isin_securities` 的來源本身（不是 API，是這個公開網頁），使用者要自行在「特別股」分類區塊找到對應代號核對。目前 28 檔特別股全部是「上市」（`strMode=2`）；twse-ts 提到「上櫃」（`strMode=4`）有額外例外收錄，但目前資料庫裡沒有任何一檔特別股是上櫃，之後如果出現要記得補上第二個來源。 |
| MOPS 特別股權利基本資料查詢 | `https://mopsov.twse.com.tw/mops/web/t47sb12` | `preferred_stock_right` 的公開來源，mops-ts 2026-09-07 用 2002A/2881A 逐欄位對照過完全吻合。 |
| TWSE 個股日成交資訊查詢 | `https://www.twse.com.tw/zh/trading/historical/stock-day.html` | `daily_price` 的公開來源——twse-ts 實際抓取走的是機器可讀的 OpenAPI（`openapi.twse.com.tw`），但這裡選人看得懂、能操作的查詢頁，因為 `dataSources` 是給終端使用者查證用的。 |

**三個都是互動查詢頁，不是深連結**——沒有辦法帶參數直接跳到某一筆記錄，使用者點進去
後還要自己輸入公司代號/日期查詢，`note` 欄位會說明這一點，避免使用者誤以為點了就會
看到對應那一列。

**逐欄位**要對到哪個確切欄位（比 `dataSources` 更細的顆粒度），查以下這張表（之後這
支端點的欄位有變動要同步更新）：

| 欄位 | 來源 |
|---|---|
| `symbol`/`name`/`isinCode`/`listedDate`/`marketType` | twse-ts `export.isin_securities`（原樣透傳） |
| `issueDate`/`issuePrice`/`dividendRate` | mops-ts `export.preferred_stock_right`（原樣透傳，取最新 `series_no`） |
| `cumulativeDividend`/`participatingExcessDividend`/`liquidationPreference`/`votingRights`/`convertible`/`conversionStartDate` | 同上，`preferred_stock_right`（原樣透傳） |
| `redeemable`/`redemptionDate`/`redemptionConditions` | 同上，`preferred_stock_right`（原樣透傳，見下方「發行人贖回權」說明） |
| `latestClosePrice`/`latestPriceDate` | twse-ts `export.daily_price`（透過 `getStockPriceAsOf`，見 `marketCap.ts`） |
| `nominalDividendRatePct` | **本服務自算**：`dividendRate / issuePrice * 100` |
| `currentYieldPct` | **本服務自算**：`dividendRate / latestClosePrice * 100` |
| `callRiskAmount` | **本服務自算**：`issuePrice − latestClosePrice`，只在 `redeemable=true` 時計算 |
| `ytcPct`／`ytcAssumption`／`ytwPct`／`negativeConvexityWarning` | **本服務自算**：見下方「YTW（最差殖利率）/負凸性警示」一節 |

## 實作決定：relay + 幾個輕量計算欄位

`dividend_rate` 欄位是「每股固定配息金額」（新台幣元），不是百分比——欄位名稱容易誤會，
2026-09-06 逐檔核對過目前 28 檔上市中的特別股才確認。算出兩個不同的百分比，都用同一個
`dividendRate` 當分子：

- `nominalDividendRatePct` = `dividendRate / issuePrice * 100`（票面利率，發行時基準，之後不隨股價變動）。
- `currentYieldPct` = `dividendRate / 最新收盤價 * 100`（目前殖利率，隨股價每天變動）。

這兩個是不同概念——例如 `2002A`（中鋼特，1974 年發行）`nominalDividendRatePct=14`（當年
利率環境），但用 2026 年目前股價算出來的 `currentYieldPct` 只有 3.75%，不要混為一談。

`redeemable`/`redemptionDate`/`redemptionConditions` 描述的是**發行人贖回權（call）**，
不是投資人賣回權（put）——2026-09-06 跟 web-nuxt 確認過：查了多檔 `redemption_conditions`
原文都是「（本公司）得...收回」句型，主詞是發行公司，`preferred_stock_right` 這張表也
完全沒有投資人賣回權的欄位。`redemptionDate` 是 mops-ts 存好的真實欄位（已驗證等於
「發行日 + redemptionConditions 描述的保護期」），代表「發行人開始有權贖回」的日期，不是
「已經被贖回」——即使已經過了這個日期，特別股仍然可能正常交易（發行人選擇不贖回）。

- `callRiskAmount`：買回風險 = 發行價 − 最新收盤價，只在可贖回時才計算——發行人贖回是按
  發行價買回，現價高於發行價時這個值是負的，代表投資人可能被迫吃下這個負值大小的損失
  （用市價買進卻只能拿回發行價）。

## YTW（最差殖利率）/負凸性警示（2026-09-07 新增）

依 conductor-ts 的「特別股指標計算引擎」規劃文件實作，只做文件裡標註優先評估的這兩支
（DM/有效存續期/OAS 需要利率樹模型，複雜度高很多，這批不做；股息覆蓋率/信評調降沒有
任何前端頁面要求，也不做）。純函式計算層在 `src/shared/preferredStockYield.ts`。

- **YTP（永續殖利率）就是 `currentYieldPct`**，不用重算（文件公式 $P_0=D/y_{YTP}$
  反推 $y_{YTP}=D/P_0$，跟 `currentYieldPct` 的定義完全相同）。
- **YTC（贖回殖利率）**：現金流是 n 期年配息（`dividendRate`）+ 第 n 期末贖回價
  （`issuePrice`，發行人贖回是按發行價買回），沒有封閉解，用二分法對現值公式求根
  （`solveYieldToCall`）。
- **`n`（期數）依贖回日狀態分兩種情境（`resolveYtcPeriods`）**：實測 26 檔可贖回特別股
  裡 **14 檔（54%）贖回日已經過了**（例如 1101B 台泥乙特 2023-12-13 已過，現在仍正常
  交易）——這些證券的真實狀態是「發行人隨時可能贖回，但選擇還沒贖回」，沒有下一個確定
  的贖回時點可以當 n 用。使用者確認的處理方式：兩種情境都算，都回傳，用 `ytcAssumption`
  標記清楚：
  - `scheduled_redemption_date`：贖回日還在未來，n = 無條件進位到贖回日的年數（最小值 1）。
  - `past_redemption_date_assumed_next_period`：贖回日已過，n=1，假設「下一次配息後即
    被贖回」的簡化情境——**這是人為假設，不是真實排定的贖回時間**，前端顯示 `ytcPct`
    時應該根據這個欄位額外標註警語。
- **`ytwPct` = min(`currentYieldPct`, `ytcPct`)**，`ytcPct` 為 null（不可贖回或缺輸入）
  時退回等於 `currentYieldPct`。
- **`negativeConvexityWarning`**：現價相對發行價（贖回價）溢價超過 2% 時為 true，只在
  可贖回且輸入齊全時計算——沿用 `callRiskAmount` 已確認的「發行人贖回按發行價買回」
  對應關係。

不進 `pitMetrics`（沒有「季度財報」「knowledge_date」這些概念可以套）也不進
`filterCatalog.ts`（不是季度財報衍生的計算指標，是證券基本資料 + 市場資料的組合，形狀
接近 `GET /companies/profile`）。只做「目前上市中」的清單，不做歷史已收回系列的查詢
（`preferred_stock_right` 裡不在目前 28 檔 `isin_securities` 名單內的那 49 列）。

`limit`/`offset` 分頁沿用 `GET /companies` 的慣例——目前只有 28 檔，遠低於上限，是為了
介面一致性跟預留成長空間，不是現在就有效能疑慮。

## 順帶修正的共用基礎設施 bug（2026-09-06）

實測特別股股價時發現 `getStockPriceAsOf`（`src/shared/sourceData/marketCap.ts`）對冷門
股票（例如 `1312A` 國喬特連續幾天沒成交）會誤判成查無股價——原本只抓「最新一列」，沒過濾
`close IS NOT NULL`，沒成交那天 `close` 是 null 但那一列還是存在。已修正成「找最近一筆真的
有成交價的日期」，這是共用函式，`fcfYield`/`psr`/`pFcf`/`evEbitda`/`altmanZScore` 的市值
（X4）這些既有指標理論上都會受惠，只是流動性好的股票平常不會踩到這個 bug。

## 相關檔案

`src/shared/sourceData/preferredStock.ts`（查詢層）、`src/shared/preferredStockYield.ts`
（YTW/負凸性純函式計算層）、`controller.ts`／`route.ts`／`openapi.ts`／`types.ts`
（API 層）、`tests/shared/sourceData/preferredStock.test.ts`（真實資料交叉驗證，含
「同一個 preferred_stock_code 要拿最新 series_no」的邊界案例）、
`tests/shared/preferredStockYield.test.ts`（YTC 二分法的封閉解交叉驗證+自洽性驗證、
`resolveYtcPeriods`/`calculateNegativeConvexityWarning` 邊界案例）、
`tests/shared/sourceData/marketCap.test.ts`（`getStockPriceAsOf` 冷門股票沒成交日的
回歸測試）。
