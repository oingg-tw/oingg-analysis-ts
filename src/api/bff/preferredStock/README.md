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

## 實作決定：relay + 兩個輕量計算欄位

`dividend_rate` 欄位是「每股固定配息金額」（新台幣元），不是百分比——欄位名稱容易誤會，
2026-09-06 逐檔核對過目前 28 檔上市中的特別股才確認。算出兩個不同的百分比，都用同一個
`dividendRate` 當分子：

- `nominalDividendRatePct` = `dividendRate / issuePrice * 100`（票面利率，發行時基準，之後不隨股價變動）。
- `currentYieldPct` = `dividendRate / 最新收盤價 * 100`（目前殖利率，隨股價每天變動）。

這兩個是不同概念——例如 `2002A`（中鋼特，1974 年發行）`nominalDividendRatePct=14`（當年
利率環境），但用 2026 年目前股價算出來的 `currentYieldPct` 只有 3.75%，不要混為一談。

不進 `pitMetrics`（沒有「季度財報」「knowledge_date」這些概念可以套）也不進
`filterCatalog.ts`（不是季度財報衍生的計算指標，是證券基本資料 + 市場資料的組合，形狀
接近 `GET /companies/profile`）。只做「目前上市中」的清單，不做歷史已收回系列的查詢
（`preferred_stock_right` 裡不在目前 28 檔 `isin_securities` 名單內的那 49 列）。

## 相關檔案

`src/shared/sourceData/preferredStock.ts`（查詢層）、`controller.ts`／`route.ts`／
`openapi.ts`／`types.ts`（API 層）、`tests/shared/sourceData/preferredStock.test.ts`
（真實資料交叉驗證，含「同一個 preferred_stock_code 要拿最新 series_no」的邊界案例）。
