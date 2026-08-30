# oingg-analysis-ts

從 [oingg-mops-ts](../oingg-mops-ts) 已寫入資料庫的季度財報資料（損益表、資產負債表、現金流量表）計算財務比率，目前只做 ROE。本服務**只讀**，不擁有任何表的 schema、不做 migration，也不向 MOPS 抓取資料——資料必須先透過 oingg-mops-ts 的 ingest API 寫入才能被查到。

## 技術棧

- TypeScript + `tsx`（開發期直接跑 `.ts`，不用先編譯）
- `ultimate-express`（Express 相容 API）
- Prisma + PostgreSQL（**與 oingg-mops-ts 共用同一個 Neon 資料庫**，本服務只讀）
- Zod（request 驗證）
- Swagger（`swagger-jsdoc` 從路由檔的 JSDoc 註解自動產生文件）

## 快速開始

```bash
pnpm install          # postinstall 會自動跑 prisma generate
pnpm dev              # tsx watch src/index.ts，預設監聽 :5000
```

`.env` 需要 `DATABASE_URL`（帶 `-pooler`，給 runtime 用）、`DIRECT_URL`（不帶 `-pooler`，只用來 `prisma db pull` 內省，本服務不會拿它做 migration）——兩者跟 oingg-mops-ts 的 `.env` 是同一組連線字串。

啟動後可到 `http://localhost:5000/api-docs` 看 Swagger UI 手動測試。

## 架構

跟 oingg-mops-ts 同一套 `src/shared`、`src/adapters`、`src/domains` 慣例，但因為本服務不做 ingest，每個指標的 domain 只有 `types.ts` / `service.ts`（DB 查詢 + 計算）/ `controller.ts` / `route.ts`，沒有 `parser.ts` / `ingest.ts`。

`src/domains` 底下依 [investment_metrics_taxonomy](src/domains/README.md)（v3.0）分九大類，每一類一個資料夾，每個資料夾都有自己的 `README.md` 說明這一類的範疇跟指標清單（含尚未實作的）——完整索引跟每一類的定位說明見 [src/domains/README.md](src/domains/README.md)，這裡不重複列。

- `domains/profitability/`、`domains/cashFlow/`、`domains/solvency/`、`domains/turnover/`：目前唯四有實作的分類，底下才有真的 domain（`types.ts` / `service.ts` / `controller.ts` / `route.ts`）。
- `domains/valuation/`、`domains/guru/`、`domains/technicals/`、`domains/portfolio/`、`domains/macro/`、`domains/securityInfo/`、`domains/marketData/`、`domains/financials/`、`domains/growth/`：目前只有 `README.md` 記錄這一類要放哪些指標，還沒有任何程式碼——這是刻意的，先把分類骨架跟每個指標的公式/口徑記下來，之後要做哪個再回頭建 domain。後四個是另一套評估中的分類方案，見 [`src/domains/README.md`](src/domains/README.md) 的「第二套分類方案」說明。

URL 路徑跟這個分類結構一一對應（`/<分類>/<指標>`，例如 `/profitability/roe`），維護時可以直接照 URL 找到程式碼位置，不用另外記一份對照表。這條路徑經過三次刻意的演進：一開始是扁平的 `/api/ratios/eps`；加上分類結構後改成 `/api/ratios/profitability/eps`；發現分類本身已經表達了「這是財務指標」，`ratios` 這層純粹是重複資訊，拿掉變成 `/api/profitability/eps`；最後因為本服務沒有網頁前端要伺服、不會跟其他路徑混淆，`api` 這層前綴也是多餘的，才拿掉變成現在的 `/profitability/eps`。每一次都是一次性 breaking change，沒有保留舊路徑。各分類底下的路由怎麼掛，見 [`src/routes.ts`](src/routes.ts)（用 `apiRouter.use('/profitability', roeRouter, roaRouter, ...)` 這種方式把分類前綴跟各指標的 router 組起來，每個指標自己的 `route.ts` 不需要知道自己屬於哪個分類前綴）。

`src/shared/rocQuarter.ts` 是從 oingg-mops-ts 同名檔案複製、只保留 `getPastNQuarters` 的精簡版（本服務不判斷「最新應公告季度」，也不需要 `getQuarterEndDate`）。

## `prisma/schema.prisma` 是唯讀鏡像

最初的三個 model（`QuarterlyIncomeStatement`、`QuarterlyBalanceSheet`、`QuarterlyCashFlowStatement`）是用 `node node_modules/prisma/build/index.js db pull` 對既有資料庫內省後，手動整理成跟 oingg-mops-ts 原本 schema 一致的 camelCase + `@map` 命名風格；後續陸續發現這個資料庫還有其他表沒鏡像過（`CapitalStockHistory`、`MonthlyCpi`，2026-08-28 發現 `FinancialReportAnnouncement`，還有已知存在但還沒鏡像的 `dividend_distribution`/`preferred_stock_right`——**這個資料庫實際有幾張表，`prisma/schema.prisma` 不一定跟得上，需要新資料源時先用 `information_schema.tables` 內省確認一次，不要假設沒鏡像到的就是不存在**），現有 model 清單以 `prisma/schema.prisma` 本身為準，這裡不重複列。**永遠不要對這些表跑 `prisma migrate`**——表格定義變更一律由 oingg-mops-ts 負責。如果 oingg-mops-ts 那邊改了 schema，重新跑一次 `db pull` 內省、對照調整即可（見 schema 檔開頭註解）。反過來也會發生表格消失：`DailyMarketIndex`/`DailyStockPrice`（2026-08-26 曾經鏡像過）2026-08-30 從資料庫裡整個消失了，已經從 schema 移除，市值/Beta 需要的股價資料改用下面「`prisma/twse/schema.prisma`」一節說明的 oingg-twse 資料源。

`pnpm-workspace.yaml`（`blockExoticSubdeps: false` + `allowBuilds`）是從 oingg-mops-ts 複製過來的——`ultimate-express` 依賴 `uWebSockets.js`（git 來源的 exotic subdependency），沒有這個設定 `pnpm install` 會失敗，且這個設定**不能**用簡單的 `.npmrc` 達成。

`prisma/schema.prisma` 除了三張季度財報表，還有 oingg-mops-ts 新增的 `CapitalStockHistory`（`capital_stock_history`）——公司每次股本變動（現金增資、盈餘/公積轉增資、合併、減資…）生效當月一筆，是「流通股數/面額」最準確的資料源，查某一季對應的股數要取 `effectiveYear`/`effectiveMonth`（**西元年**，注意跟其他表的民國年 `year` 不是同一套曆法）小於等於目標季度的最新一筆。EPS/每股淨值等需要流通股數的指標都應該查這張表，不要用「股本 ÷ 10」去估——這條路線（原本設計了一張人工維護的面額例外表）已經作廢，因為這張表能直接給出真實歷史數字。

還有 `MonthlyCpi`（`monthly_cpi`）——月 CPI，`year`/`month` 是**西元曆**，資料範圍 1981 年至今。目前只有 [`valuation/`](src/domains/valuation/README.md) 分類的 CAPE 打算用到（通膨調整），但 CAPE 還做不了——不是 CPI 資料不夠，是 `quarterly_income_statement` 本身只有 6 個年度的歷史（民國 110~115），CAPE 需要 10 年份 EPS，見 [`src/domains/valuation/README.md`](src/domains/valuation/README.md) 的說明。

`QuarterlyBalanceSheet` 2026-08-20 新增了 `preferredStockCapital`（特別股，分類為權益）跟 `preferredStockLiability`（特別股，分類為金融負債，通常是可贖回特別股）——**`preferredStockLiability` 已經算在 `totalLiabilities` 裡面**，用到總負債的地方（負債比率、NCAV…）不要再額外扣一次 `preferredStockLiability`，會重複扣。這是用實際資料驗證 `totalLiabilities + totalEquity = totalAssets` 這個恆等式成立才確認的。目前只有 [`src/domains/guru/ncav/`](src/domains/guru/ncav/) 用到 `preferredStockCapital`。

股價/大盤指數資料原本是 mops 的 `DailyMarketIndex`/`DailyStockPrice`，2026-08-30 這兩張表整個從資料庫消失（見上一節），已改用 `prisma/twse/schema.prisma` 的 `DailyPrice`（`daily_price`，個股日成交）跟 `DailyTaiexIndex`（`daily_taiex_index`，加權股價指數），供 [`src/domains/portfolio/beta/`](src/domains/portfolio/beta/) 跟市值計算（`src/shared/marketCap.ts`）使用——欄位都是 camelCase。**覆蓋率會持續成長**：6 家種子公司（2330/2881/2867/2801/2207/2855）回填了約 5 年歷史（2021-09 至今），其他公司多半只有近幾個月，還不是全市場，查詢時一律用 `hasStockPriceCoverage` 現查現算，不要寫死公司代號，見 [`src/domains/portfolio/README.md`](src/domains/portfolio/README.md) 說明。

`FinancialReportAnnouncement`（`financial_report_announcement`）是 2026-08-28 發現、補鏡像進來的——財報**實際公告日**（`announcementDate`），跟三張季度財報表的 `reportDate`（財報涵蓋期間的**期末日**）是兩個不同的日期概念：期末日只是會計期間的結尾，市場在那天還不知道財報數字（依規定約在期末後 45 天才公告，2330 114Q2 期末 2025-06-30、公告 2025-08-12，差 43 天）。任何把股價/市值跟財報數字放一起算的指標（`Altman_Z_Score` X4、之後的 `Beta`/`PSR`/`EV_EBITDA`）股價基準都該用 `announcementDate` 不能用 `reportDate`，否則有 look-ahead bias，見 [`src/shared/reportAnnouncementDate.ts`](src/shared/reportAnnouncementDate.ts)。負責 ingest 的服務提供了 `POST /api/ingest/financial-report-announcements/backfill`，**目前已用 2330/2887/6488 三家公司 114 年度資料驗證過**（各 4/4 筆：114Q1~Q3 + 113 年報，0 警訊），是刻意先驗證這個範圍，不是漏抓；還沒涵蓋到本服務常用測試季度 115Q2，查無資料時上述指標會退回用 `reportDate` 並在 `warnings` 註明，之後可以再擴大 backfill 範圍。

## `prisma/analysis/schema.prisma` 是本服務自己擁有的第二個資料庫

跟上面「唯讀鏡像」的 `prisma/schema.prisma` 不同，`prisma/analysis/schema.prisma` 連到獨立的 Neon 專案 **oingg-analysis**（`.env` 的 `ANALYSIS_DATABASE_URL` / `ANALYSIS_DIRECT_URL`），本服務自己擁有這裡的 schema/migration，存的是**算完的投資指標結果**（不是原始財報資料）。每個指標各自一張表，因為算法/週期不一樣（大多是單季/年化/TTM，`MarketRatiosResult`/`BetaResult` 是逐日、跟財務季度脫鉤），不共用一套通用結構——現有 model 清單以 `prisma/analysis/schema.prisma` 本身為準，這裡不重複列會過期的清單，只記重要的結構性慣例：

- 表名 `@@map` 規則是 `<分類>_<指標>`，跟 `src/domains` 底下的分類資料夾一一對應（例如 `guru/ncav/` 對應 `guru_ncav`）。
- 絕大多數表的 PK 是 `symbol + year + season + dataType + subsidiaryCompanyId`（財務季度查詢）；例外是 `MarketRatiosResult`（`symbol + tradeDate`）跟 `BetaResult`（`symbol + asOfDate`）——這兩個是逐日市場資料，跟季度脫鉤，見下方各自的計算口徑說明。
- 複合指標（`GrahamNumberResult`、`SgrResult`⋯⋯）直接引用其他指標已經算好的值（例如葛拉漢數引用 `profitability_eps`/`profitability_bvps`），不重複查資料庫，也不重複實作查詢邏輯。
- 每支 API 算完都會 upsert 一筆進對應的表，供之後查歷史紀錄用；寫入失敗只會記 log，不會讓 API 回傳失敗——存檔是附加行為，不是各支 API 的主要契約。

這個 schema 有自己的 generator output（`generated/analysis-client`，已加入 `.gitignore`，`postinstall` 會一併產生），跟主 schema 的 `@prisma/client` 不會互相覆蓋。改動這裡的 model 用：

```bash
pnpm prisma:analysis:migrate   # 產生並套用 migration（不要對 prisma/schema.prisma 那份跑這個）
pnpm prisma:analysis:studio    # Prisma Studio 開這個 DB
```

## `prisma/twse/schema.prisma` 是第三個資料庫（唯讀鏡像，跟 `prisma/schema.prisma` 同一種模式）

連到獨立的 Neon 專案 **oingg-twse**（`.env` 的 `TWSE_DATABASE_URL` / `TWSE_DIRECT_URL`），本服務只讀，不擁有這裡的表格 schema/migration——跟主 schema（唯讀鏡像 oingg-mops-ts）是同一種模式，跟自己擁有 schema 的 `prisma/analysis/schema.prisma` 不同。

oingg-twse 這個資料庫實際上有多張表，目前鏡像了 3 張：

- **`DailyPrice`**（`daily_price`）：每日開高低收、成交量、成交金額、成交筆數。市值計算（`shared/marketCap.ts`）跟 `Beta`、`Altman_Z_Score` X4、`PSR`/`P_FCF`/`EV_EBITDA` 都靠這張表，2026-08-30 取代已消失的 mops `daily_stock_price`。
- **`DailyValuation`**（`daily_valuation`）：已經有算好的 `peRatio`/`pbRatio`/`dividendYield`。2026-08-19 拍板：`valuation` 分類的 PER/PBR/股利殖利率**直接採用這張表現成的數字**，不用本服務自己的 EPS/BVPS 重算——見 [`src/domains/valuation/README.md`](src/domains/valuation/README.md) 的權衡說明跟「PER/PBR/股利殖利率計算口徑」。
- **`DailyTaiexIndex`**（`daily_taiex_index`）：加權股價指數（TAIEX）每日開高低收，`Beta` 計算的市場報酬率來源，2026-08-30 取代已消失的 mops `daily_market_index`。

其他表先不鏡像，還沒決定要不要用：

- **`quarterly_balance_sheet`** / **`quarterly_income_statement`**：跟 oingg-mops-ts 的財報表部分重疊但欄位不完全一樣（例如這邊直接有 `book_value_per_share`），用途跟資料來源都還不清楚，先不用。
- **`twse_raw`**：原始資料 JSON payload，不是整理過的結構化資料，用不到。

這個 schema 有自己的 generator output（`generated/twse-client`，已加入 `.gitignore`）。改動/重新內省用：

```bash
pnpm prisma:twse:pull     # 重新對 oingg-twse 跑 db pull 內省（不要對這份 schema 跑 migrate）
pnpm prisma:twse:studio   # Prisma Studio 開這個 DB
```

## `prisma/cbc/schema.prisma` 是第四個資料庫（唯讀鏡像，同一種模式）

2026-08-28 原本為了 `guru/Greenwald_EPV` 的 CAPM 無風險利率接上，連到獨立的 Neon 專案（`.env` 的 `CBC_DATABASE_URL` / `CBC_DIRECT_URL`），本服務只讀，不擁有這裡的表格 schema/migration，資料由另一支負責 ingest 央行統計資料庫 API 的服務寫入。`Greenwald_EPV` 後來因為「資產重置成本」無法用忠於資料的方式算，2026-08-28 決定移除（見 [`src/domains/guru/README.md`](src/domains/guru/README.md) 的「為什麼不做 Greenwald_EPV」），但這個資料源本身是通用的無風險利率資料，沒有一併移除，[`src/domains/macro/`](src/domains/macro/README.md) 的 `YTM` 未來用得到。

目前只有一張表：

- **`MonthlyGovBondYield10y`**（`monthly_gov_bond_yield_10y`）：10年期政府公債次級市場殖利率，月資料，1994-12 至今（368 筆）。來源是央行 API 的 `EG43M01en`（資本市場利率）第 20 欄「Bond market - 10-year gov't bond rates in secondary market」——特別挑這一欄不是發行端利率，是因為 CAPM 要的是市場實際交易出來的殖利率。查詢用 [`src/shared/riskFreeRate.ts`](src/shared/riskFreeRate.ts) 的 `getRiskFreeRateAsOf(asOfDate)`。

這個 schema 有自己的 generator output（`generated/cbc-client`，已加入 `.gitignore`）。改動/重新內省用：

```bash
pnpm prisma:cbc:pull     # 重新對 CBC 資料庫跑 db pull 內省（不要對這份 schema 跑 migrate）
pnpm prisma:cbc:studio   # Prisma Studio 開這個 DB
```

## `prisma/tpex/schema.prisma` 是第五個資料庫（唯讀鏡像，同一種模式）

2026-08-30 接上，補一個實際上線後才發現的缺口：`GET /valuation/ranking`（見 [`src/domains/valuation/README.md`](src/domains/valuation/README.md)）文件上寫「全市場排行」，但一開始只查了 oingg-twse，完全漏掉上櫃市場——是 bff-ts 實測比對兩邊資料量（TWSE ~1080 檔、TPEx ~890 檔）才回報發現的。連到獨立的 Neon 專案 **oingg-tpex**（`.env` 的 `TPEX_DATABASE_URL` / `TPEX_DIRECT_URL`），本服務只讀，不擁有這裡的表格 schema/migration——跟 oingg-twse 同一種模式，兩邊 `daily_valuation` 欄位定義完全一樣（`symbol`/`tradeDate`/`peRatio`/`pbRatio`/`dividendYield`）。

目前只鏡像了一張表：

- **`DailyValuation`**（`daily_valuation`）：上櫃版本的每日估值比率，跟 oingg-twse 的同名表是同一種資料，只是換一個市場。oingg-tpex 實際上還有其他表（`company_profile`、`daily_price`、`tpex_raw`），需要時再補。

這個 schema 有自己的 generator output（`generated/tpex-client`，已加入 `.gitignore`）。改動/重新內省用：

```bash
pnpm prisma:tpex:pull     # 重新對 TPEx 資料庫跑 db pull 內省（不要對這份 schema 跑 migrate）
pnpm prisma:tpex:studio   # Prisma Studio 開這個 DB
```

## API 一覽

URL 路徑跟 `src/domains` 底下的分類資料夾一一對應（`/<分類>/<指標>`），維護時可以直接照路徑找到程式碼位置（見 [`src/domains/README.md`](src/domains/README.md) 的分類索引）。

| Method + Path | 說明 |
|---|---|
| `GET /profitability/roe` | 計算單一公司單一季度的 ROE（單季、單季年化、TTM 三種數值） |
| `GET /profitability/roa` | 計算單一公司單一季度的 ROA（資產報酬率，單季、單季年化、TTM 三種數值） |
| `GET /profitability/bvps` | 計算單一公司單一季度的 BVPS（每股淨值） |
| `GET /profitability/eps` | 計算單一公司單一季度的 EPS（單季、單季年化、TTM 三種數值） |
| `GET /profitability/revenue-per-share` | 計算單一公司單一季度的每股營收（單季、單季年化、TTM 三種數值） |
| `GET /profitability/margins` | 計算單一公司單一季度的毛利率、營業利益率、稅後淨利率（單季、TTM 兩種數值） |
| `GET /profitability/roic` | 計算單一公司單一季度的投入資本回報率（ROIC，單季、單季年化、TTM 三種數值） |
| `GET /profitability/roce` | 計算單一公司單一季度的使用資本報酬率（ROCE，單季、單季年化、TTM 三種數值） |
| `GET /profitability/dividend-payout-ratio` | 計算單一公司配息率（只有 TTM 口徑） |
| `GET /profitability/sgr` | 計算單一公司可持續成長率（SGR，只有 TTM 口徑，複合指標） |
| `GET /profitability/dupont` | 計算單一公司杜邦分析法（3 步拆解 ROE = 淨利率 x 總資產週轉率 x 權益乘數，單季、TTM 兩種數值，複合指標） |
| `GET /cash-flow/cash-flow-per-share` | 計算單一公司單一季度的每股營業現金流（OCF）與每股自由現金流（FCF） |
| `GET /cash-flow/ocf-to-net-income` | 計算單一公司單一季度的營運現金流對淨利比（單季、TTM 兩種數值） |
| `GET /cash-flow/accruals-ratio` | 計算單一公司單一季度的應計項目比率（單季、單季年化、TTM 三種數值） |
| `GET /cash-flow/fcf-yield` | 計算單一公司自由現金流殖利率（FCF_Yield，簡易年化、TTM 兩種數值，複合指標） |
| `GET /solvency/debt-ratio` | 計算單一公司單一季度的負債比率 |
| `GET /solvency/liquidity-ratio` | 計算單一公司單一季度的流動比率、速動比率與現金比率 |
| `GET /solvency/de-ratio` | 計算單一公司單一季度的負債權益比 |
| `GET /solvency/interest-coverage` | 計算單一公司單一季度的利息保障倍數（單季、TTM 兩種數值） |
| `GET /solvency/net-debt-to-ebitda` | 計算單一公司單一季度的淨負債對 EBITDA 比（簡易年化、TTM 兩種數值） |
| `GET /turnover/turnover-ratio` | 計算單一公司單一季度的存貨/應收帳款/應付帳款/總資產/固定資產周轉率、DIO/DSO/DPO 週轉天數與 CCC 現金轉換週期 |
| `GET /turnover/capex-to-revenue` | 計算單一公司單一季度的資本支出佔營收比（單季、TTM 兩種數值） |
| `GET /valuation/market-ratios` | 查詢單一公司最新（或指定日期）的 PER、PBR、股利殖利率（直接採用 oingg-twse 現成數字） |
| `GET /valuation/psr` | 計算單一公司股價營收比（PSR，簡易年化、TTM 兩種數值，複合指標） |
| `GET /valuation/p-fcf` | 計算單一公司股價自由現金流比（P_FCF，簡易年化、TTM 兩種數值，複合指標） |
| `GET /valuation/ev-ebitda` | 計算單一公司企業價值倍數（EV_EBITDA，簡易年化、TTM 兩種數值，複合指標） |
| `GET /valuation/ranking` | 依 PER、PBR 或殖利率排行全市場公司（唯一一支查全市場而不是查單一公司的端點） |
| `GET /guru/graham-number` | 計算單一公司單一季度的葛拉漢數（`sqrt(22.5 x EPS(TTM) x BVPS)`） |
| `GET /guru/ncav` | 計算單一公司單一季度的葛拉漢淨流動資產價值（NCAV）與安全邊際價 |
| `GET /guru/owner-earnings` | 計算單一公司單一季度的每股股東盈餘（Buffett Owner Earnings，單季、單季年化、TTM 三種數值） |
| `GET /guru/altman-z-score` | 計算單一公司原始版 Altman Z-Score（`year`/`season` 選填，不給就抓最新一季；X4 依股價覆蓋率決定能不能算） |
| `GET /guru/piotroski-f-score` | 計算單一公司皮爾托斯基 F 分數（0~9 分，9 項訊號跟去年同季比較） |
| `GET /guru/beneish-m-score` | 計算單一公司貝尼許 M 分數（法務會計造假預警，8 個變量跟去年同季比較，TATA 除外） |
| `GET /guru/nissim-penman-rnoa` | 計算單一公司 Nissim & Penman RNOA 拆解（`ROE = RNOA + FLEV x SPREAD`，單季、單季年化、TTM 三種數值，複合指標） |
| `GET /guru/zmijewski-score` | 計算單一公司 Zmijewski Score（財務危機 Probit 預警模型） |
| `GET /guru/ohlson-o-score` | 計算單一公司 Ohlson O-Score（財務危機 Logit 預警模型） |
| `GET /portfolio/beta` | 計算單一公司相對加權股價指數的貝塔係數（1Y/2Y/5Y 三種窗口；6 家種子公司歷史深度最完整） |
| `GET /technicals/ma` | 計算單一公司移動平均線（MA，5D/10D/20D/60D/120D/200D，SMA） |
| `GET /technicals/macd` | 計算單一公司平滑異同移動平均線（MACD，12/26/9） |
| `GET /technicals/kd` | 計算單一公司隨機指標（KD，9D/14D） |
| `GET /technicals/rsi` | 計算單一公司相對強弱指標（RSI，6D/14D/24D，Wilder's RSI） |
| `GET /technicals/bollinger-bands` | 計算單一公司布林通道（Bollinger Bands，20D，2 個標準差） |
| `GET /technicals/atr` | 計算單一公司真實波動區間均值（ATR，14D/20D） |
| `GET /technicals/bias` | 計算單一公司乖離率（BIAS，5D/20D/60D） |
| `GET /technicals/obv` | 計算單一公司能量潮（OBV；taxonomy 的 VWAP_OBV 只做了 OBV，VWAP 結構性做不到） |
| `GET /filters` | 列出目前可用來 filter 的分類/指標/欄位清單，見 [`src/domains/system/filterCatalog.ts`](src/domains/system/filterCatalog.ts) |

Query 參數，兩種介面：(1) `GET /valuation/market-ratios`、`GET /portfolio/beta`、`GET /technicals/*`（8 個技術指標）只有 `companyId`（必填）+ 選填的日期（`market-ratios` 是 `date`，`beta`/`technicals` 是 `asOfDate`），因為都是逐日市場資料，不是季度財報資料，見下方「PER/PBR/股利殖利率計算口徑」、[`src/domains/portfolio/README.md`](src/domains/portfolio/README.md)、[`src/domains/technicals/README.md`](src/domains/technicals/README.md) 的說明。(2) **其餘所有季度財報類指標**（`profitability`/`cashFlow`/`solvency`/`turnover`/`guru` 五個分類，包含只回傳 TTM 口徑的 `GET /profitability/dividend-payout-ratio`、`GET /profitability/sgr`）共用同一組：`companyId`（必填）、`dataType`（`'1'`=個別, `'2'`=合併，預設 `'2'`）、`subsidiaryCompanyId`（預設空字串，選填）；`year`（民國年）/`season`（`'1'`~`'4'`）**選填但要成對**（要嘛都給要嘛都不給，只給其中一個是 400），不給就自動抓最新一季——見下方「year/season 選填、自動抓最新一季的設計」。

### year/season 選填、自動抓最新一季的設計（2026-08-28）

2026-08-24 `Altman_Z_Score` 率先做了「不給 year/season 就自動抓最新一季」，2026-08-28 推廣到幾乎所有季度財報類指標。動機：不同公司財報**實際申報進度不同步**——不是理論假設，是實測驗證過的真實資料（本服務開發資料庫裡，公司 2887 的 `quarterly_balance_sheet`/`quarterly_cash_flow_statement` 已經有 115Q1 資料，但 `quarterly_income_statement` 卡在 114Q2，中間差 3 季）。如果前端/使用者假設「現在都幾月了，大家應該都出到某一季了吧」對每家公司套用同一個季度去查，對申報進度落後的公司會查到 `null`，容易誤判成「沒資料」而不是「這家公司真的還沒到那一季」。

- **「最新一季」不是看任一張表自己的最新一季，是這支指標實際需要的所有表的交集**：例如 ROE 需要資產負債表+損益表，對 2887 自動解析出來的「最新一季」是 114Q2（損益表的瓶頸），不是資產負債表自己的 115Q1——只看資產負債表會誤判成「有資料」，實際上那一季損益表是空的，一樣算不出來。見 [`src/shared/latestQuarter.ts`](src/shared/latestQuarter.ts) 的 `getLatestAvailableQuarter`。
- **複合指標**（`sgr`、`dupont`、`grahamNumber`）自己解析一次「所有底層服務需要的表的聯集」的最新一季，解析完把確定的 `year`/`season` 傳給底層服務，底層服務不會各自重複解析（也不會各自解析出不同季度）。
- **查無任何一季所有需要的表都有資料時**（例如完全查無資料的公司），回應的 `year`/`season` 會是 `null`，其餘欄位優雅降級為 `null`，`warnings` 說明原因，不會回傳錯誤狀態碼。
- 只給 `year`/`season` 其中一個視為無效請求，回傳 400。

## ROE 計算口徑（未來 session 接手前務必看）

- **欄位選擇**：淨利、權益都優先採用「歸屬於母公司」口徑（`netIncomeAttributableToParent` / `equityAttributableToParent`），分子分母範圍一致；缺漏時（例如遇到 oingg-mops-ts `parser.ts` 的「模糊比對防呆」把欄位解析成 `null` 的公司）退回用整體數字（`netIncome` / `totalEquity`）。回應的 `netIncome.fieldUsed` / `equity.fieldUsed` 會標明實際用了哪個欄位。
- **`roeQuarterlyPct`**：單季（未年化）ROE = 本季淨利 / 本季期末權益 x 100。用的是**期末權益**，不是期初期末平均——這是刻意的簡化選擇（v1 優先求簡單、可驗證），如果之後要改成平均權益，需要額外查詢上一季（或去年 Q4）的資產負債表。
- **`roeQuarterlyAnnualizedPct`**：`roeQuarterlyPct` 簡單 x4，不是用近四季實際加總算出來的年化數字，僅供快速估算參考。
- **`roeTtmPct`**：近四季（含本季）淨利加總 / 本季期末權益 x 100。近四季任何一季缺資料，或該季淨利欄位是 `null`，就整個 TTM 回傳 `null`（缺的季度不會另外存欄位，只會列在 `warnings` 的文字訊息裡），不會用部分資料湊數字。
- **查無資料不是錯誤**：資料庫查無該季資料，或關鍵欄位是 `null`，端點仍回傳 `200`，相關 ROE 欄位是 `null`，原因寫在 `warnings` 裡——因為「這季公司還沒申報」或「這欄位還沒抓」是正常情境，不是伺服器錯誤。
- 已用台積電（2330）114Q2 合併報表實測驗證：單季淨利 3,982.7 億元、期末權益 45,810.7 億元，算出單季 ROE 8.69%（數字量級與台積電 2025 Q2 實際公告淨利相符）。

## BVPS 計算口徑

- **權益欄位選擇**：跟 ROE 一樣優先採用「歸屬於母公司」口徑（`equityAttributableToParent`），缺漏時退回 `totalEquity`。
- **流通股數**：查 `capital_stock_history`（見 `src/shared/capitalStock.ts` 的 `getPaidInSharesAsOf`）——股本是歷史異動紀錄，不是固定值，要找生效日（西元年月）小於等於本季資產負債表**報告日**（期末日，不是公告/申報日）的最新一筆，不能直接抓整張表最新一筆。回應的 `paidInShares.effectiveYear` / `effectiveMonth` 會標明實際套用的是哪一筆。
- **單位陷阱（踩過一次）**：三張季度財報表的金額欄位單位是「千元」，但 `capital_stock_history.paidInShares` 是實際股數（不是千股）。算 `bvps = equityValue / paidInShares` 前，equityValue 要先 x1000 換算成元，否則答案會差 1000 倍——第一版就是漏了這步，算出 0.18 而不是正確的 176.65（台積電 114Q2）。這個單位差異之後算 EPS TTM、每股營收、每股現金流等指標時也都會遇到，務必注意。
- **`subsidiaryCompanyId`**：`capital_stock_history` 只有母公司（上市櫃公司本身）的股本紀錄，沒有子公司維度。指定 `subsidiaryCompanyId` 查詢時，流通股數仍是母公司的股本結構，會在 `warnings` 中註明，數值是否適用需自行判斷。
- 已用台積電（2330）114Q2 合併報表實測驗證：期末權益 45,810.7 億元 ÷ 流通股數 25,932,615,521 股 = BVPS 176.65 元（量級與台積電當時實際淨值相符）。
- **驗證時務必對齊同一季度**：曾發生拿 114Q2（2025 Q2）算出的 176.65 元去跟「2026 Q2」的外部估算比對，誤以為算錯——實際上兩者是不同季度，不能直接比。改抓 115Q2（2026 Q2）驗證得到 248.05 元，跟外部估算的 241 元量級相符（~3% 誤差，可能是股數口徑細節差異）。

## EPS 計算口徑

跟 ROE 一樣是單季/單季年化/TTM 三個數值放同一支 API、同一張表（`epsQuarterly` / `epsQuarterlyAnnualized` / `epsTtm`），不要拆成多支 API 或多張表——一開始曾先做成獨立的 `eps-ttm` API/`eps_ttm_result` 表，後來發現這樣不對稱（ROE 三個口徑同一張表，EPS 卻只做 TTM 開一張表），已經改掉。

- **淨利欄位選擇**：跟 ROE 一樣優先採用「歸屬於母公司」口徑（`netIncomeAttributableToParent`），缺漏時退回 `netIncome`。
- **跟季報 `eps`/`epsDiluted` 不同**：那兩個欄位是公司自己申報的數字，這裡是本服務自己用「淨利 / 股本歷史對應的流通股數」算出來的，口徑上可以互相對照，但不是同一個計算方式。
- **`epsQuarterly`**：本季淨利 / 本季報告日對應的流通股數。
- **`epsQuarterlyAnnualized`**：`epsQuarterly` 簡單 x4，跟 ROE 的年化邏輯一致，非以近四季實際加總計算。
- **`epsTtm`**：近四季（含本季）淨利加總 / 本季報告日對應的流通股數。近四季資料須全部存在且淨利欄位皆非 null，否則整個回傳 `null`（不會用部分資料湊數字），缺的季度只列在 `warnings` 文字裡。
- **流通股數／單位換算**：跟 BVPS 完全一樣的做法——查 `capital_stock_history` 抓報告日當時生效的股數，金額欄位（千元）要先 x1000 換算成元再除。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：本季淨利 706,561,938 千元 → epsQuarterly 27.25 元、epsQuarterlyAnnualized 109 元；近四季（114Q3~115Q2）淨利加總 2,237,087,087 千元 → epsTtm 86.27 元。2026-08-27 更新：oingg-mops-ts 修正 `quarterly_income_statement` 的 Q4（原本存的是全年累計數，不是單季數）後，TTM 數字全部改變，這裡是修正後的數字；單季數字不受影響。

## 每股營收計算口徑

跟 EPS 同一種單季/單季年化/TTM 三欄位結構，計算方式也完全一樣，只是分子換成 `operatingRevenue`（營收沒有「歸屬於母公司」的口徑選擇問題，單一欄位）。

- **`revenuePerShareQuarterly`**：本季營收 / 本季報告日對應的流通股數。
- **`revenuePerShareQuarterlyAnnualized`**：`revenuePerShareQuarterly` 簡單 x4。
- **`revenuePerShareTtm`**：近四季（含本季）營收加總 / 本季報告日對應的流通股數，近四季資料須完整存在才會計算，否則為 `null`。
- 流通股數／單位換算做法跟 BVPS、EPS 完全一樣（查 `capital_stock_history`、金額 x1000 換算成元）。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：本季營收 1,270,380,250 千元 → 每股營收 48.99 元、年化 195.96 元；近四季營收加總 4,440,492,429 千元 → TTM 每股營收 171.23 元（2026-08-27 mops Q4 資料修正後的數字，見上方 EPS 段落說明）。

## 每股現金流（OCF/FCF）計算口徑

跟 EPS/每股營收同一種單季/年化/TTM 三欄位結構，但 OCF 跟 FCF 兩個指標放同一支 API、同一張表——因為算 FCF 一定要先有 OCF 跟資本支出，拆成兩支 API 會重複查兩次現金流量表跟股本，沒必要。

- **`ocfPerShareQuarterly`**：本季 `netCashFromOperatingActivities` / 本季報告日對應的流通股數。
- **`fcfPerShareQuarterly`**：`(本季 netCashFromOperatingActivities + 本季 capitalExpenditures) / 流通股數`——**注意是加不是減**，因為資料庫裡的 `capitalExpenditures` 本身已經是負數（現金流出），例如台積電 115Q2 是 `-846,764,746` 千元。
- **`*QuarterlyAnnualized`**：對應單季數值簡單 x4。
- **`*Ttm`**：近四季（含本季）加總 / 流通股數。一季只要 `netCashFromOperatingActivities` 或 `capitalExpenditures` 任一為 `null`，該季就整個視為不齊，OCF 跟 FCF 共用同一組「資料齊不齊」判斷，不分開追蹤兩套缺季清單。
- 流通股數／單位換算做法跟 BVPS、EPS、每股營收完全一樣。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：本季 OCF 783,364,977 千元、資本支出 -496,001,947 千元 → OCF 每股 30.21 元、FCF 每股 11.08 元；近四季 OCF 加總 2,634,679,110 千元、資本支出加總 -1,491,122,744 千元 → TTM OCF 每股 101.60 元、TTM FCF 每股 44.10 元。2026-08-27 更新：oingg-mops-ts 修正 `quarterly_cash_flow_statement`（原本每一季存的都是當年累計數，不是單季數，不是只有 Q4）後，本季跟 TTM 數字都改變了，這裡是修正後的數字。

## ROA 計算口徑

結構跟 ROE 完全一樣（單季/單季年化/TTM 三欄位），差別只在分母換成總資產、不需要挑欄位（`totalAssets` 是單一欄位，沒有「歸屬於母公司」的版本可選）。

- **淨利欄位選擇**：跟 ROE 一樣優先採用「歸屬於母公司」口徑（`netIncomeAttributableToParent`），缺漏時退回 `netIncome`。**這是刻意跟本服務其他指標保持一致的選擇**，不是教科書上常見「整體淨利（含少數股權）對整體總資產」的對稱口徑——如果之後要改成後者，分子要換成不挑欄位、直接用損益表的整體淨利。
- **`roaQuarterlyPct`**：本季淨利 / 本季期末總資產 x 100，用的是期末總資產，不是期初期末平均。
- **`roaQuarterlyAnnualizedPct`**：`roaQuarterlyPct` 簡單 x4。
- **`roaTtmPct`**：近四季（含本季）淨利加總 / 本季期末總資產 x 100，近四季資料須完整存在才會計算，否則為 `null`。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：本季淨利 706,561,938 千元 ÷ 總資產 9,375,654,727 千元 = ROA 7.54%。跟同季 ROE 10.98% 對照，權益乘數（總資產/權益）≈ 1.457，7.54% x 1.457 ≈ 10.98%，數字互相對得上（DuPont 拆解關係）。

## 負債比率計算口徑

跟 ROE/ROA/EPS 那組「單季/年化/TTM 三欄位」結構不同——負債比率是純資產負債表的時點快照（某一天的餘額比率），annualize 或 TTM 對這種比率沒有意義，所以只有單一 `debtRatioPct` 欄位，不套用其他指標的三欄位樣板。

- **`debtRatioPct`**：本季期末總負債（`totalLiabilities`） / 本季期末總資產（`totalAssets`） x 100。
- 不需要股本歷史，也不需要損益表，只查一次資產負債表。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：總負債 2,901,183,746 千元 ÷ 總資產 9,375,654,727 千元 = 負債比率 30.94%。

## 流動比率／速動比率／現金比率計算口徑

跟負債比率一樣是純資產負債表時點快照，沒有單季/年化/TTM 的區別。三個比率共用同一支 API、同一張表——分母都是流動負債，拆開只會重複查同一張資產負債表。

- **`currentRatioPct`（流動比率）**：本季期末流動資產（`currentAssets`） / 本季期末流動負債（`currentLiabilities`） x 100。
- **`quickRatioPct`（速動比率）**：`(currentAssets - inventory) / currentLiabilities` x 100。
- **`cashRatioPct`（現金比率）**：本季期末現金及約當現金（`cashAndEquivalents`） / `currentLiabilities` x 100。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：流動資產 4,565,700,742 千元、流動負債 1,857,761,825 千元、存貨 385,524,542 千元、現金及約當現金 3,134,218,213 千元 → 流動比率 245.76%、速動比率 225.01%、現金比率 168.71%。

## 負債權益比計算口徑

一樣是純資產負債表時點快照。跟負債比率（`Debt_to_Assets`）不同：分子不是總負債，是**有息負債**——`shortTermBorrowings`（短期借款） + `bondsPayable`（應付公司債） + `longTermBorrowings`（長期借款），不含應付帳款等營運性負債。三個欄位任一為 `null` 視為 0（沒有借那種負債），不是資料缺漏；只有整張資產負債表查無資料時才視為缺資料。

- **`deRatioPct`**：本季期末有息負債 / 本季期末權益（跟 ROE 一樣優先採用 `equityAttributableToParent`，缺漏時退回 `totalEquity`） x 100。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：有息負債 864,263,674 千元（短期借款為 0、應付公司債 815,036,716 千元、長期借款 49,226,958 千元）÷ 權益 6,432,518,334 千元 = 負債權益比 13.44%。

## 利息保障倍數計算口徑

跟毛利率/營業利益率/稅後淨利率同一種「流量/流量」結構——只有單季跟 TTM 兩種口徑，沒有年化。財報沒有現成的 EBIT 欄位，用「稅前淨利 + 利息費用」反推。

- **EBIT** = `profitBeforeTax`（稅前淨利） + `financeCosts`（利息費用）。
- **`interestCoverageQuarterly`**：本季 EBIT / 本季利息費用。
- **`interestCoverageTtm`**：近四季（含本季）EBIT/利息費用各自加總後再算比率，近四季資料須完整存在才會計算，否則為 `null`。
- 利息費用為零時無法計算（除以零），會列在 `warnings`。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：EBIT 865,515,135 千元 ÷ 利息費用 3,085,049 千元 = 利息保障倍數 280.55 次（TTM 227.02 次，2026-08-27 mops Q4 資料修正後的數字）——數字很高，符合台積電低負債的財務體質。

## 淨負債對 EBITDA 比計算口徑

**第一個要同時查三張財報表的指標**：資產負債表算淨負債（存量），損益表+現金流量表算 EBITDA（流量）。淨負債是存量，對「一年份」EBITDA 流量的比率才有標準意義，taxonomy 只支援 TTM/FY，不支援單季——所以沒有原始單季版本，只有簡單年化跟 TTM 兩種口徑。

- **淨負債**：有息負債（`shortTermBorrowings` + `bondsPayable` + `longTermBorrowings`，邏輯跟負債權益比一樣） − 現金及約當現金（`cashAndEquivalents`）。可能是負數，代表淨現金部位而非淨負債。
- **EBITDA** = EBIT（`profitBeforeTax` + `financeCosts`） + 折舊（`depreciation`） + 攤銷（`amortization`），折舊/攤銷來自現金流量表的間接法加回項目。
- **`netDebtToEbitdaQuarterlyAnnualized`**：淨負債 / (本季 EBITDA x4)。
- **`netDebtToEbitdaTtm`**：淨負債 / 近四季 EBITDA 實際加總，近四季資料須完整存在才會計算，否則為 `null`。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：有息負債 864,263,674 千元 − 現金 3,134,218,213 千元 = 淨負債 -2,269,954,539 千元（負數，淨現金部位）；本季 EBITDA 1,064,053,303 千元 → 年化比率 -0.53；近四季 EBITDA 加總 3,368,653,910 千元 → TTM 比率 -0.67。2026-08-27 更新：EBITDA 用到現金流量表的折舊/攤銷，mops 現金流量表修正後本季跟 TTM 數字都改變了（淨負債純資產負債表數字不受影響）。

## 周轉率計算口徑

跟 ROE 同一種單季/單季年化/TTM 三欄位結構，但存貨、應收帳款、總資產、固定資產四個周轉率放同一支 API、同一張表——都要查同一張損益表+資產負債表，也共用同一組 TTM 完整性判斷（一季只要營業成本或營收任一為 null，該季就整個視為不齊），拆開只會重複查詢。

- **`inventoryTurnoverQuarterly`（存貨周轉率）**：本季營業成本（`operatingCost`） / 本季期末存貨（`inventory`）。
- **`receivablesTurnoverQuarterly`（應收帳款周轉率）**：本季營收（`operatingRevenue`） / 本季期末應收帳款（`accountsReceivable`）。
- **`assetTurnoverQuarterly`（總資產周轉率）**：本季營收 / 本季期末總資產（`totalAssets`）。
- **`fixedAssetTurnoverQuarterly`（固定資產周轉率）**：本季營收 / 本季期末不動產、廠房及設備（`propertyPlantEquipment`）。
- 分母都用**期末餘額**，不是期初期末平均——跟 ROE 用期末權益一樣的刻意簡化。
- **`*QuarterlyAnnualized`**：對應單季數值簡單 x4。
- **`*Ttm`**：近四季（含本季）營業成本／營收加總 / 本季期末餘額，近四季資料須完整存在才會計算，否則為 `null`。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：存貨周轉率 1.06 次（TTM 4.12 次）、應收帳款周轉率 2.92 次（TTM 10.19 次）、總資產周轉率 0.14 次（TTM 0.47 次）、固定資產周轉率 0.30 次（TTM 1.03 次）。2026-08-27 更新：mops Q4 資料修正後 TTM 數字改變，單季數字不受影響。

## 資本支出佔營收比計算口徑

跟毛利率/營業利益率/稅後淨利率同一種「流量/流量」結構——只有單季跟 TTM 兩種口徑，沒有年化（不像周轉率是流量對存量）。

- **`capexToRevenueQuarterly`**：|本季資本支出（`capitalExpenditures`）| / 本季營收 x 100。資料庫裡 `capitalExpenditures` 本身是負數（現金流出），計算比率時取絕對值——資本支出佔營收比慣例上是正數百分比，不是負的。
- **`capexToRevenueTtm`**：近四季（含本季）營收/資本支出各自加總後再算比率，近四季資料須完整存在才會計算，否則為 `null`。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：資本支出 496,001,947 千元 ÷ 營收 1,270,380,250 千元 = 資本支出佔營收比 39.04%（TTM 33.58%，2026-08-27 mops 現金流量表修正後的數字）——資本密集度很高，符合台積電先進製程持續大量投資的財務體質。

## 毛利率/營業利益率/稅後淨利率計算口徑

跟其他指標最大的差異：這三個都是「同期流量 / 同期流量」的比率（例如本季毛利 / 本季營收），比率本身已經跟期間長度無關，**不需要年化**——不像 ROE 是流量（淨利）對存量（權益），年化才有意義。所以 `margins` 只有 `*Quarterly` 跟 `*Ttm` 兩種口徑，沒有 `*QuarterlyAnnualized`。三個比率放同一支 API、同一張表，理由跟周轉率一樣：都要查同一張損益表，也共用同一組 TTM 完整性判斷。

- **`grossMarginQuarterly`（毛利率）**：本季毛利（`grossProfit`） / 本季營收 x 100。
- **`operatingMarginQuarterly`（營業利益率）**：本季營業利益（`operatingIncome`） / 本季營收 x 100。
- **`netProfitMarginQuarterly`（稅後淨利率）**：本季淨利 / 本季營收 x 100，淨利欄位跟 ROE 一樣優先採用「歸屬於母公司」口徑（`netIncomeAttributableToParent`），缺漏時退回 `netIncome`。
- **`*Ttm`**：近四季（含本季）營收/毛利/營業利益/淨利各自加總後再算比率，近四季資料須完整存在才會計算，否則為 `null`——一季只要任一欄位為 `null`，該季就整個視為不齊，三個比率共用同一組完整性判斷。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：毛利率 67.72%（TTM 64.23%）、營業利益率 60.34%（TTM 56.10%）、稅後淨利率 55.62%（TTM 50.38%）。2026-08-27 更新：mops Q4 資料修正後 TTM 數字改變，單季數字不受影響。

## PER/PBR/股利殖利率計算口徑

**這支 API（`GET /valuation/market-ratios`）跟本服務其他所有指標的設計都不一樣，務必先看這段。**

- **不是自己算，是直接讀 oingg-twse 的 `daily_valuation`**：`peRatio`/`pbRatio`/`dividendYieldPct` 三個數值原封不動來自對方算好的結果，本服務沒有用自己的 EPS/BVPS 重新計算。好處是實作快、不用自己踩 EPS 口徑的坑；代價是**不知道對方 EPS 用的是單季、TTM 還是年度口徑**——跟本服務自己算的 EPS（`GET /profitability/eps`）、BVPS（`GET /profitability/bvps`）口徑不保證一致，不要拿來互相驗證或混用。回應的 `warnings` 固定會提醒這件事。
- **查詢介面不是季度查詢**：只有 `companyId`（+ 選填 `date`，格式 `YYYY-MM-DD`，不給就抓最新一筆），沒有 `year`/`season`/`dataType`/`subsidiaryCompanyId`。**第一版設計錯誤**：一開始直接套用其他 API 的季度查詢模板，把 PER/PBR 綁在「該季財報報告日當天」的股價上，結果因為 oingg-twse 的市場資料在 2026-08-19 當下只有 3 天（剛開始收集，不是歷史回補），查任何已報過的歷史季度都是 `null`。後來想清楚：PER/PBR 是逐日市場資料，時間刻度跟財務季度不是同一回事，taxonomy 的 `MRQ` 指的是分母用哪一期 EPS，不是分子股價要對應哪一天，才改成現在這個「跟季度脫鉤」的介面。
- **`date` 的查詢邏輯**：不指定就抓整張 `daily_valuation` 表最新一筆；指定 `date` 則找「該日期或之前」最新一筆交易日資料（指定日期不一定是交易日，例如週末），回應的 `tradeDate` 會標明實際套用的是哪一天。
- 已用台積電（2330）實測驗證：2026-08-17 資料 PER 27.82、PBR 9.68、殖利率 0.92%；指定 `date=2026-08-20`（週末後）正確找回 8/17 那筆；指定太早的日期（例如 `2026-06-30`，早於資料起始日）正確回傳 `null` 並在 `warnings` 說明原因。

## 葛拉漢數計算口徑

**本服務第一個複合指標**：`GET /guru/graham-number` 不自己查資料庫，而是直接呼叫已經寫好的 `calculateEps`（[`src/domains/profitability/eps/service.ts`](src/domains/profitability/eps/service.ts)）跟 `calculateBvps`（[`src/domains/profitability/bvps/service.ts`](src/domains/profitability/bvps/service.ts)），取兩者算出來的 `epsTtm`/`bvps` 直接套公式——不重複實作淨利/權益口徑選擇、流通股數查詢那些邏輯。副作用是呼叫這支 API 時，`eps`/`bvps` 兩支服務也會各自照常把自己的結果 upsert 進 `profitability_eps`/`profitability_bvps`，這是預期行為，不是意外。之後其他複合指標都應該照這個模式，直接引用既有服務，不要重新查資料庫。

- **公式**：`葛拉漢數 = sqrt(22.5 x EPS(TTM) x BVPS)`。出處：葛拉漢認為本益比不超過 15 倍、股價淨值比不超過 1.5 倍的股票才算便宜，兩者乘積上限 15 x 1.5 = 22.5，推導出合理價上限。
- **EPS 用 TTM**（近四季滾動），不是單季或簡單年化版本。
- EPS 或 BVPS 為零或負值時無法計算（公式假設公司要有正的獲利跟正的淨值），會在 `warnings` 註明。
- 這跟 taxonomy 的 `Graham_NCAV`（葛拉漢淨流動資產價值）是葛拉漢提出的**兩個不同公式**，taxonomy 沒有把葛拉漢數單獨列出來，是本服務自行歸類進 `guru` 分類的指標。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：`sqrt(22.5 x 86.27 x 248.05)` = 葛拉漢數 693.89 元（2026-08-27 更新：TTM EPS 因為 mops Q4 資料修正而改變，見上方 EPS 段落說明）。

## Graham_NCAV（NCAV）計算口徑

- **公式**：NCAV = (流動資產 − 總負債 − 特別股) / 流通股數；`marginOfSafetyPrice`（安全邊際價） = NCAV x (2/3)——葛拉漢認為用低於 NCAV 三分之二的價格買進才有足夠安全邊際。純資產負債表時點快照，沒有單季/年化/TTM 的區別。
- **特別股欄位一開始查不到，後來 oingg-mops-ts 補上了**：`quarterly_balance_sheet` 2026-08-20 新增 `preferredStockCapital`（分類為權益）跟 `preferredStockLiability`（分類為金融負債，通常是可贖回特別股）。**NCAV 只扣 `preferredStockCapital`**——`preferredStockLiability` 已經算在 `totalLiabilities` 裡面，重複扣會低估 NCAV，這是用實際資料驗證 `totalLiabilities + totalEquity = totalAssets` 這個恆等式成立才確認的。查不到欄位（或本來就沒有特別股）視為 0，不是資料缺漏。
- **這個公式不適用金融/保險業**：查了全部 13 家公司，`2838`、`2850`、`2867`、`2887`、`5843`（都是金控/保險股）`currentAssets` 全部是 `null`——這類公司的資產負債表本來就不按流動/非流動分類，不是資料沒抓到，NCAV 這個公式本來就是設計給一般產業公司用的。查詢這幾家公司會正確回傳 `null` 並在 `warnings` 說明原因。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：流動資產 4,565,700,742 千元 − 總負債 2,901,183,746 千元 − 特別股 0 = NCAV 64.19 元、安全邊際價 42.79 元。用 2887（金控）115Q1 驗證正確回傳 `null`，`warnings` 列出三個原因：`currentAssets` 為 `null`、偵測到有特別股（13,946,680 千元）已扣除、`capital_stock_history` 查無資料。

## 已知缺口 / Backlog

- **已實作**：見 [`src/domains/README.md`](src/domains/README.md) 的分類索引，每個分類底下的狀態欄有最新進度，這裡不重複維護一份會過期的清單。`solvency` 分類已全數完成；`Altman_Z_Score` 2026-08-24 改歸類到 `guru/`、2026-08-27 實作（見 [`src/domains/guru/README.md`](src/domains/guru/README.md)）。
- **mops 財報資料曾經有「累計數混單季數」的問題，2026-08-27 已由 oingg-mops-ts 修正**：`quarterly_income_statement` 的 Q4（原本存的是全年累計數）跟 `quarterly_cash_flow_statement` 的每一季（原本全部都存當年累計數，不是只有 Q4）都改成真的單季數，另外新增 `annual_income_statement`/`annual_cash_flow_statement`（全年總額）、`cumulative_cash_flow_statement`（保留原始累計數，供需要的人用）。修正前用簡單「近四季加總」算 TTM 的指標，只要窗口跨到 Q4 就會算錯（過度計入），這是本服務發現的既有資料 bug，不是本服務自己的邏輯錯誤——修正後所有既有 TTM 計算都自動變正確，不需要改程式碼，但涉及的數字都變了，各分類 README 的「已實測驗證」段落已經更新成修正後的數字。
- **市值計算**：個股收盤價 x `capital_stock_history`（mops，股價基準日當下生效股本，`getPaidInSharesAsOf`）。收盤價原本用 mops 的 `daily_stock_price`，該表 2026-08-30 從資料庫消失，改用 oingg-twse 的 `daily_price`（見 [`src/shared/marketCap.ts`](src/shared/marketCap.ts)）——不是 2026-08-21 一開始討論的 `company_profile.issued_shares` x `daily_price.close` 那條路線（`issued_shares` 是「現在」的股數快照，不是歷史時點的股數，配歷史財報季度市值會不準；`capital_stock_history` 才是歷史股數的正確來源）。**`daily_price` 覆蓋率會持續成長**：6 家種子公司（2330/2881/2867/2801/2207/2855）回填了約 5 年歷史，其他公司多半只有近幾個月。查詢邏輯一律現查有沒有資料（見 `hasStockPriceCoverage`），不要在程式碼裡寫死特定公司代號——2026-08-28 才修過一次 `Altman_Z_Score` 誤把 `companyId === '2330'` 當判斷依據的 bug。不在覆蓋範圍內的公司市值相關欄位（`Altman_Z_Score` 的 X4、`portfolio/beta`）會是 `null`，`fieldStatuses` 標成 `not_applicable`，是覆蓋率限制，不是程式邏輯問題。
- **股價基準日 2026-08-28 修正**：原本拿財報期末日（`reportDate`）當股價基準日是錯的——期末日只是會計期間結尾，市場那天還不知道財報數字，正確要用財報實際**公告日**（`financial_report_announcement.announcementDate`）。查無公告日（該表目前只涵蓋 2330/2887/6488 三家公司、113Q4~114Q3 四個季度，覆蓋率很低）才退回期末日並在 `warnings` 註明可能有 look-ahead bias。見 [`src/shared/reportAnnouncementDate.ts`](src/shared/reportAnnouncementDate.ts) 跟 [`src/domains/guru/README.md`](src/domains/guru/README.md) 的「市值資料源」說明，目前只有 `Altman_Z_Score` 的 X4 套用了這個修正。
- **五年加權 ROE 暫緩**：使用者想要的是中國證監會「加權平均淨資產收益率」那種逐月加權權益的算法（見 `src/domains/profitability/roe/` 相關討論），但現有資料只有季度期末餘額，股利發放日期、其他綜合損益變動都沒有精確日期，只有股本變動（`capital_stock_history`）有精確月份——股本只是權益的小部分，保留盈餘（獲利累積）才是主要變動來源且完全沒有日期資料。使用者決定先暫停，等他準備好股利發放日期等資料後再繼續，目前先做其他不受此限制的指標。
- **ROE 用期末權益而非期初期末平均權益**：見上方「ROE 計算口徑」，是刻意的 v1 簡化，非 bug。
- **測試**：[`tests/`](tests/README.md)——用 Node.js 內建 `node:test`（`pnpm test`），大多是打真的開發資料庫的整合測試，把各分類 README 記錄的實測數字釘成自動化斷言，不是每支既有 API 都有覆蓋，新增/修改指標時建議照 [`tests/README.md`](tests/README.md) 的慣例補一個。
- **沒有身份驗證**：跟 oingg-mops-ts 的 ingest API 一樣，目前完全開放。
- **ESM import 不帶 `.js` 副檔名**：跟 oingg-mops-ts 相同慣例與理由（`tsconfig.json` 用 `moduleResolution: "Bundler"` + `tsx` 執行，非原生 Node ESM）。
