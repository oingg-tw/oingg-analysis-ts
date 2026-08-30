# 估值與市場定價指標（valuation_and_pricing）

- **scope**：Security
- **說明**：衡量個股或證券市價相對各項基礎財務維度的市場定價乘數與折溢價幅度。
- **狀態**：部分實作（`PER`、`PBR`、`Dividend_Yield` 透過 oingg-twse 的現成數字；`PSR`、`P_FCF`、`EV_EBITDA` 2026-08-30 自己組合既有服務算出來，見下方）。`NAV_Discount_Premium` 2026-08-30 決定移除，見下方指標清單後的說明。另外新增全市場排行端點，見下方「排行榜 vs 單一公司查詢」。

## 股價資料源：oingg-twse

2026-08-19 接上第三個資料庫 **oingg-twse**（`.env` 的 `TWSE_DATABASE_URL` / `TWSE_DIRECT_URL`，見 [`../../../prisma/twse/schema.prisma`](../../../prisma/twse/schema.prisma)），本服務只讀，跟主 schema（唯讀鏡像 oingg-mops-ts）同一種模式。這個資料庫實際上有 5 張表，目前鏡像了兩張：

- **`DailyPrice`**（`daily_price`）：每日開高低收、成交量、成交金額、成交筆數。
- **`DailyValuation`**（`daily_valuation`）：oingg-twse 已經算好的 `peRatio`/`pbRatio`/`dividendYield`。

2026-08-19 拍板：`PER`/`PBR`/`Dividend_Yield` **直接採用 `daily_valuation` 現成的數字**，不用本服務自己的 EPS/BVPS 重新計算——優點是實作快、不用自己踩 EPS 口徑的坑；代價是不知道 oingg-twse 的 EPS 用的是單季、TTM 還是年度口徑，是外部黑盒數字，**跟本服務自己算的 EPS（[`../profitability/eps/`](../profitability/eps/)）、BVPS（[`../profitability/bvps/`](../profitability/bvps/)）口徑不保證一致，不要拿來互相驗證或混用**。

## 查詢介面不是季度查詢——一個踩過的設計錯誤

本服務其他每個指標都是「查某公司某季度」（`companyId` + `year` + `season` + `dataType` + `subsidiaryCompanyId`）。[`marketRatios/`](marketRatios/) 第一版直接套用這個模板，把 PER/PBR 綁在「該季財報報告日當天」的股價上——結果因為 oingg-twse 的市場資料才剛開始收集（2026-08-19 當下只有 3 天資料，遠晚於任何已報過的季度），查任何歷史季度都是 `null`。

問題不在資料覆蓋不夠，而在**查詢介面本身套錯模板**：PER/PBR 是逐日的市場資料，時間刻度跟財務季度不是同一回事，taxonomy 的 `MRQ` 指的是分母用哪一期 EPS，不是說分子股價要對應到那一季發生的那一天。改成只用 `companyId`（+ 選填 `date`，不給就抓最新一筆），完全跟財務季度脫鉤，才是對的介面。

## 排行榜 vs 單一公司查詢：[`ranking/`](ranking/)

2026-08-30 新增，`GET /valuation/ranking`——本服務目前唯一一支「查全市場排行」而不是「查一家公司」的端點。跟其他指標最大的差別是資料來源本身就已經是全市場齊的：`daily_valuation` 是 oingg-twse（上市）跟 oingg-tpex（上櫃）各自算好、每天更新的現成數字，排行榜只是對這兩張表下 `ORDER BY ... LIMIT N` 再合併，不需要先把每家公司都查過一次才有資料可以排。

**一開始漏了上櫃市場，是 bff-ts 實測發現回報的**：剛上線時這支端點只查了 oingg-twse，雖然文件上寫「全市場」，實際上完全沒有上櫃資料（約 890 檔），排行結果名不符實。跟接 twse/gov 同一種模式，另外接上第四個資料庫 **oingg-tpex**（`.env` 的 `TPEX_DATABASE_URL` / `TPEX_DIRECT_URL`，見 [`../../../prisma/tpex/schema.prisma`](../../../prisma/tpex/schema.prisma)），目前只鏡像了 `DailyValuation`（跟 oingg-twse 同名表欄位完全一致），上市、上櫃各自查询、取前 limit 名再合併重排——這是「合併 k 個已排序列表取前 N 名」的標準作法，不是抓全部資料再排序。

這跟本服務**自己算**的指標（ROE、Altman Z-Score⋯）形成鮮明對比：那些指標是「懶惰計算」，只有真的被查詢過的公司才會被算出來、存進 `oingg-analysis`——沒有排程主動幫全市場跑一輪，所以現在做不出「ROE 前 20 名」這種排行（資料不齊，不是查詢介面的問題）。`Greenblatt_Magic_Formula`、`Mohanram_G_Score` 卡住的也是同一個原因，見 [`../guru/README.md`](../guru/README.md)。要解這個問題得先有全市場批次計算的排程，是資料 pipeline 層級的工作，不是加一個排行 API 就好，之後如果要做，建議還是留在本服務裡開新分類（例如 `screener/`），不要切成獨立的 microservice——計算邏輯跟結果資料庫都已經在這裡，切出去只會變成重複實作，或每次排行查詢都要對這邊發上千次 API call。

`peRatio`/`pbRatio` 排行會排除 `<= 0` 的公司（虧損或淨值為負不是「便宜」，是財務體質問題，混進「最低本益比」排行會誤導使用者），`dividendYield` 沒有這個排除。`order` 沒有預設值，呼叫端必須自己指定 `asc`/`desc`，避免對排序方向產生誤會。

## CAPE 卡在哪裡：不是通膨資料，是財報歷史深度不夠

2026-08-20 查過：oingg-mops-ts 新增了 `MonthlyCpi`（`monthly_cpi`，見 [`../../../prisma/schema.prisma`](../../../prisma/schema.prisma)）——月 CPI，1981 年至今，548 筆，通膨調整需要的資料完全足夠，不是問題。

真正卡住的是 `quarterly_income_statement` 本身的歷史深度：目前資料庫裡（不分公司）財報資料只有**民國 110~115 年，6 個年度**，CAPE 需要**十年份**的 EPS 才能算「十年平均實質 EPS」，還差 4 年。這不是本服務能解決的問題（不是缺資料源，是既有資料源的歷史還沒累積夠），只能等 oingg-mops-ts 那邊的財報資料涵蓋到 10 個年度以上再回頭做。

## PSR / P_FCF / EV_EBITDA 市值資料源與計算慣例

2026-08-30 實作。三個都是「市值（存量）/ 某個財務指標（流量）」的結構，跟 [`../solvency/netDebtToEbitda/`](../solvency/netDebtToEbitda/) 同一種道理——拿市值除以「一季」的營收/FCF/EBITDA 沒有標準意義，所以都只提供 `QuarterlyAnnualized`（本季簡單 x4）跟 `TTM`（近四季實際加總）兩種口徑，沒有純單季版本。三個都不重複查原始財報表，而是直接引用已經算好的服務：`PSR` 引用 `revenuePerShare`、`P_FCF` 引用 `cashFlowPerShare`、`EV_EBITDA` 引用 `netDebtToEbitda`。

市值算法完全比照 [`../guru/README.md`](../guru/README.md) 的 Altman_Z_Score X4：股價 = oingg-twse `daily_price` 收盤價（**財報公告日**或之前最近一個交易日，優先用 `financial_report_announcement.announcementDate` 避免 look-ahead bias，查無公告日才退回財報期末日並在 `warnings` 註明），流通股數 = mops `capital_stock_history`（該基準日當下生效的股本）。**覆蓋率會持續成長**（6 家種子公司 2330/2881/2867/2801/2207/2855 回填了約 5 年歷史，其他公司多半只有近幾個月），不在覆蓋範圍內的公司會是 `null`，`fieldStatuses` 標成 `not_applicable`；有覆蓋但這次查詢缺其他東西（例如財報資料本身缺漏）則標成 `no_data`，判斷邏輯見 `hasStockPriceCoverage`。

單位陷阱：財報金額欄位（營收、FCF、淨負債、EBITDA）單位是千元，市值是「股價 x 實際股數」的真實新台幣金額——分母都要先 x1000 換算成同一個單位再除，不然會差 1000 倍，這是 BVPS/Altman X4 都踩過的同一個坑，三個服務裡都各自處理了一次。

## 指標清單

| code | 中文名稱 | 公式 | supported_periods | 狀態 |
|---|---|---|---|---|
| `PER` | 本益比 | `Stock Price / EPS` | TTM, FY, Forward, MRQ | ✅ 已實作 — [`marketRatios/`](marketRatios/)，`GET /valuation/market-ratios`。直接來自 `daily_valuation.peRatio`，見上方說明 |
| `CAPE` | 席勒本益比 / 週期調整本益比 | `Real Price / 10-Year Average Real EPS` | 10Y_Rolling | ⬜ 未實作——卡在財報歷史深度不夠，見下方說明（**不是**通膨資料的問題，那個已經有了） |
| `PBR` | 股價淨值比 | `Stock Price / Book Value Per Share` | MRQ, FY | ✅ 已實作 — [`marketRatios/`](marketRatios/)，`GET /valuation/market-ratios`。直接來自 `daily_valuation.pbRatio` |
| `PSR` | 股價營收比 | `Market Cap / Annual Revenue` | QuarterlyAnnualized, TTM | ✅ 已實作 — [`psr/`](psr/)，`GET /valuation/psr`。營收引用 [`../profitability/revenuePerShare/`](../profitability/revenuePerShare/) 已算好的數字，市值見下方「PSR / P_FCF / EV_EBITDA 市值資料源」 |
| `P_FCF` | 股價自由現金流比 | `Market Cap / Free Cash Flow` | QuarterlyAnnualized, TTM | ✅ 已實作 — [`pFcf/`](pFcf/)，`GET /valuation/p-fcf`。FCF 引用 [`../cashFlow/cashFlowPerShare/`](../cashFlow/cashFlowPerShare/) 已算好的營業現金流+資本支出 |
| `EV_EBITDA` | 企業價值倍數 | `Enterprise Value / EBITDA` | QuarterlyAnnualized, TTM | ✅ 已實作 — [`evEbitda/`](evEbitda/)，`GET /valuation/ev-ebitda`。淨負債、EBITDA 引用 [`../solvency/netDebtToEbitda/`](../solvency/netDebtToEbitda/) 已算好的數字，EV = 市值 + 淨負債 |
| `Dividend_Yield` | 股息殖利率 | `Annual Dividend Per Share / Stock Price` | TTM, Forward, FY | ✅ 已實作 — [`marketRatios/`](marketRatios/)，`GET /valuation/market-ratios`。直接來自 `daily_valuation.dividendYield` |

## 為什麼不做 NAV_Discount_Premium（2026-08-30 決定移除）

`NAV_Discount_Premium`（淨值折溢價率）衡量的是「市價相對淨資產價值的折溢價」，適用對象是封閉式基金、ETF、REITs 這類「持有一籃子資產、有明確可計算 NAV」的證券——這一類的 NAV 是逐日公告的官方數字，折溢價才有意義。本服務的 `scope` 是個股（Security），沒有這種標的，套用到一般上市櫃公司沒有對應的官方 NAV 可以拿來比較（用 BVPS 冒充 NAV 是兩個不同概念，公司股價偏離帳面淨值有非常多合理原因，跟基金折溢價的意義不一樣），不是資料源缺口，是這個指標本身跟本服務的適用範疇不合，直接移除，不用不對的資料硬做。
