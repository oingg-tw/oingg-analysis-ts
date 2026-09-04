# 跨服務 / 跨模組詞彙表（Ubiquitous Language）

## 這份文件是什麼

2026-09-04 讀完《在 Node.js 生態系中落地 Domain-Driven Design》這份研究文件後，盤點
analysis-ts 自己的程式碼跟它消費的 5 個上游服務（mops-ts/twse-ts/tpex-ts/gov-ts/sitca-ts）
export schema 鏡像（`prisma/*Export/schema.prisma`），把「同一個概念、不同服務或不同模組
叫法不一致」的地方列出來，純粹當參考，**不是要求全部改成同一個名字**——這些名字在各自的
context 裡都已經穩定使用一段時間，重新命名的成本（改 45 支指標的 query 參數、改資料庫欄位、
通知所有消費者）遠大於「叫法統一」帶來的好處。真正的價值是：下次遇到「這欄位到底是什麼」
的疑惑時，先查這份表，不用重新 grep 一輪。

## 公司/證券識別碼

同一個「股票代號」在不同地方有 4 種名字：

| 來源 | 欄位名 | 備註 |
|---|---|---|
| mops-ts、twse-ts、tpex-ts export schema | `symbol` | 三家原始資料源一致 |
| gov-ts export schema | `symbol`（多數 view）／`stock_code`（僅 `company_industry_classification`） | gov-ts 自己內部就不一致 |
| sitca-ts（ETF）export schema | `security_code` | ETF 用證券代號的正式說法，不是公司股票代號 |
| analysis-ts 的 `analysis` DB（自己的結果表） | `symbol` | 45 張指標結果表 + ETF 排行都用這個 |
| analysis-ts 對外 API：`metrics/**`（45 支指標） | `companyId` | **query 參數叫 companyId，但傳進去的值就是 symbol 字串（例如 "2330"）** |
| analysis-ts 對外 API：`stocks`／`companies`／`securities`／ETF（`etfRanking`/`etfScreener`） | `symbol` | 跟資料庫欄位一致 |

**✅ 2026-09-04 已統一**：原本 `metrics/**` 44 支指標（`macro/equityRiskPremium`、
`macro/govBondYield10y`、`valuation/ranking` 這 3 支沒有單一公司參數，不算在內）的 query
參數跟 JSON 回應欄位都叫 `companyId`，跟同一個服務裡其他所有端點（`stocks`/`companies`/
`securities`/ETF）的 `symbol` 不一致——已經連對外 HTTP API 一起改成 `symbol`（query 參數
`?companyId=` → `?symbol=`，回應欄位 `companyId` → `symbol`），這是刻意的 breaking
change，已通知 bff-ts 同步更新。`dataCompleteness` 也一併改了（透過
`indicatorRegistry.ts` 的 job 簽名跟這批指標綁在一起）。

**2026-09-04 追加**：原本這裡寫「明確排除 `companies` 網域」，後來 bff-ts 主動回饋
`GET /companies/profile` 的 query 參數叫 `companyId`，但同一支端點的回應本體早就用
`symbol`（`CompanyProfileDetail.symbol`）——同一個端點自己內部就不一致，比單純的跨端點
落差更糟。已經一併改掉：`/companies/profile`、`/companies`（`CompanyNameEntry.companyId`
→ `symbol`）、`companyProfile.ts` 整份共用 helper、`registerCompanyRoute.ts`、
`latestQuarter.ts`。至此 `companyId` 在 `src/`/`tests/` 裡已經完全清空（只留下語意不同的
`getCompanyIds`/`companyIds`——這是「一批公司代號的陣列」這個概念的函式/變數命名，跟
單一 `companyId` 是否該叫 `symbol`是不同問題，沒有一併處理）。

## 財報期別（年/季）

| 來源 | 欄位名 | 型別 |
|---|---|---|
| mops-ts export schema（`quarterly_*`） | `year`（民國年）+ `quarter`（1~4） | `Int` |
| analysis-ts 全部 | `year` + `season` | 字串（`Season = '1'\|'2'\|'3'\|'4'`，見 `src/shared/rocQuarter.ts`） |

`quarter` → `season` 是 analysis-ts 這邊刻意做的翻譯，不是不小心叫錯——`year` 本身兩邊
都是民國年，沒有落差。之所以特別記錄，是因為如果之後要寫任何直接對照 mops-ts 原始欄位名
的程式碼（例如新的 raw SQL），要記得欄位名是 `quarter` 不是 `season`。

## 交易日/快照日期

| 來源 | 欄位名 |
|---|---|
| twse-ts／tpex-ts export schema（`daily_price`/`daily_valuation` 等，幾乎全部 view） | `trade_date` |
| analysis-ts 的 44 支「日資料型」結果表（8 支 technicals + `marketRatios`） | `tradeDate` |
| sitca-ts（ETF）export schema | `year_month`（月快照，不是逐日） |

**✅ 2026-09-04 已統一**：`BetaResult` 原本叫 `asOfDate`，是同一服務內部唯一的例外
（其他日資料型指標都叫 `tradeDate`，也查不到刻意理由，可能是 beta 這支指標最早實作、
命名時還沒定下 `tradeDate` 的慣例）——已經手動改成 `RENAME COLUMN`（不是 drop+add，保留
既有 1439 筆資料）統一成 `tradeDate`/`trade_date`。對外 HTTP query 參數仍然叫 `asOfDate`，
沒有受影響，這純粹是 DB 內部欄位改名。

## 產業分類代碼——兩套完全不同的分類系統，容易搞混

- **gov-ts**：`industry_code`/`section_code`/`division_code`/`group_code`/`class_code`/
  `subclass_code`——這是 DGBAS（行政院主計總處）的多層產業分類，`company_industry_classification`
  view 把公司（`stock_code`）對應到這套分類。
- **twse-ts**（2026-09-04 新增）：`export.industry_code`，兩碼代碼對應中文產業名稱
  （例如 `24: 半導體業`）——這是證交所/MOEA 體系的分類，見 `src/shared/sourceData/
  industryCodes.ts`。

這兩套分類**不是同一套代碼系統**，不能互相對照（先前已經確認過 MOEA 營業項目對不上 DGBAS
分類）——看到「產業代碼」時要先確認是哪個來源的，不要假設兩邊代碼可以互換。

## 財務科目命名的權威參考來源：mops-ts 的 XBRL 欄位

2026-09-04 mops-ts 開放了 `financialReportXbrl` 這個實驗性 domain（29 張 `export.*_xbrl`
view，inline XBRL 解析，跟既有三表 pilot 是獨立來源）。這批欄位是直接從 XBRL 科目代碼
機械轉換來的（camelCase 化、去命名空間前綴，部分因為撞名還帶隨機 hash 消歧，例如
`fair_value_of_investments_in_equity_instruments__9c69ab`），不是人工挑過的業務語言，
但正因為源頭是國際會計準則（IFRS）的標準科目代碼，這些名字本身反而是最穩定、最不會變的
「權威詞彙」，值得當作以後新增財務類指標時的命名參考，不用自己重新發明一套。

**識別碼命名先確認一致**：全部 29 張 XBRL view 的 `symbol`/`year`/`quarter`/`data_type`/
`subsidiary_company_id`/`report_date` 跟既有三表 pilot、跟這次剛統一完的 analysis-ts 對外
API 完全一致，沒有新的落差。

幾個對照到 analysis-ts 現有指標命名、可以驗證「原本取名取對了」的例子：
- `profit_loss_attributable_to_owners_of_parent`（`quarterly_income_statement_xbrl`）
  對應 `RoeResult`/`RoaResult` 用的 `netIncomeAttributableToParent`——概念一致，用詞不同
  是因為我們選了英文財務慣用語（net income）而不是 IFRS 科目原文（profit or loss），
  這是刻意的翻譯，不是需要統一的落差。
- `equity_attributable_to_owners_of_parent`（`quarterly_balance_sheet_xbrl`）對應
  `equityAttributableToParent`——同上。
- `basic_earnings_loss_per_share`/`diluted_earnings_loss_per_share` 對應 EPS 相關指標
  ——確認 EPS 這個縮寫用法跟 IFRS 標準科目的全名概念一致，只是我們用業界慣用縮寫。

**順便確認一件事**：`equity_change_xbrl` 真的有 `retrospective_restatement_effect`
這個欄位（`bigint`），跟先前 mops-ts 回覆「查整個 schema 唯一命中 restat 相關的欄位」
一致——這是一個會計科目金額（IFRS 17 轉換調整金額），不是版本追蹤用的旗標，再次確認
point-in-time/重編歷史追蹤這件事目前沒有可用的訊號，不是查漏了。

## KY 股判斷方式——tpex-ts 建議的欄位其實涵蓋更廣，不是 1:1 替代

現有邏輯（`src/shared/sourceData/companyProfile.ts`）用 `short_name LIKE '%-KY%'` 判斷
KY 股。tpex-ts 建議改用 `foreign_registration_country IS NOT NULL`（TPEx company_profile
有這個欄位）。2026-09-04 實測交叉驗證兩邊資料：

- **TPEx**：兩種判斷法完全一致（各 36 檔，零差異）。
- **TWSE**：`-KY` 判斷法抓到 95 檔，`foreign_registration_country IS NOT NULL` 抓到
  105 檔，多出來的 10 檔全部是 `-DR`（存託憑證）股票，不是 KY 股判斷漏掉的案例——這 10 檔
  註冊地涵蓋開曼、百慕達、泰國、新加坡，是「境外公司來台發行 TDR」，跟「境內公司改註冊到
  海外再直接上市」（KY 股）是概念上不同的兩種東西，只是都會讓 `foreign_registration_country`
  非空。

**結論**：`foreign_registration_country IS NOT NULL` 是「有海外註冊地」的廣義判斷，
`-KY`/`-DR` 是這個廣義概念底下的兩個子類別，不能直接拿來當「KY 股」的替代判斷式，除非
之後決定要把 DR 股也一併排除——但那是另一個需要另外討論的政策決定，不是命名/判斷方式的
technical debt。已回報這個發現給 tpex-ts。

## market/source 欄位——同一套值域、不同欄位名，而且各自涵蓋的分類不完全一樣

TWSE 跟 TPEx 的 `company_profile` 都有一個標示「這筆公司登記資料屬於哪種類別」的欄位，
值域前綴都是 `COMPANY_PROFILE*`，但：

| 來源 | 欄位名 | 實際出現的值 |
|---|---|---|
| twse-ts export schema | `source` | `COMPANY_PROFILE`（1094）／`COMPANY_PROFILE_PUBLIC`（300） |
| tpex-ts export schema | `market`（**欄位名容易誤會成市場別 TWSE/TPEx，但值不是**） | `COMPANY_PROFILE`（890）／`COMPANY_PROFILE_EMERGING`（364） |

兩邊的值域不是子集關係——TWSE 有 `_PUBLIC`（公開發行未上市）沒有 `_EMERGING`；TPEx 有
`_EMERGING`（興櫃）沒有 `_PUBLIC`，反映的可能是兩個市場實際登記類別本來就不同，不一定是
需要對齊的落差，但**欄位名不一致**（`source` vs `market`）值得跟兩邊反映，`market` 這個
名字尤其容易讓人誤以為裡面存的是 TWSE/TPEx 這種市場別。已回報給 tpex-ts。

## `/filters` metric/field key 命名規則——縮寫 vs 全名

2026-09-04 跟 web-nuxt 對過（透過 conductor 轉達的問題）：`/filters` 回的 232 個 key
（`filterCatalog.ts`）縮寫跟全名混用看似隨意，實際上把全部 key 分類歸納後，發現已經有
一條隱性但完全一致的規則在被遵守：

**照搬財務/學術圈實際在用的說法——圈內慣用縮寫就用縮寫，沒有公認縮寫就用完整描述性
camelCase 名稱，不自己發明新縮寫。**

例如 `roe`/`eps`/`per`/`pbr`/`rsi`/`macd`（圈內真的這樣講）vs `accrualsRatio`/
`grahamNumber`/`bollingerBands`/`interestCoverage`（沒有公認縮寫，講全名）；
Beneish/Ohlson 模型的 `dsri`/`gmi`/`x1`~`x5` 這類看起來很像亂碼的 key，也是照搬那兩篇
原始論文的學術標準變數名，不是隨便縮的。

這條規則已經跟 232 個現有 key 全部吻合，是把已經在做的事寫下來，**不需要重新命名任何
現有欄位**，之後新增指標時用同一條規則判斷即可。web-nuxt 也確認：對前端來說 key 本身
使用者看不到（畫面渲染的是 `name`），這條規則的價值是「雙方討論新命名時的共同語言」，
不是直接影響可讀性；真正影響可讀性的是每個 field 的 `description` 覆蓋率——已經抽查過
`x1`~`x5`、`dsri`/`gmi`/`sgai`/`lvgi`/`tata` 這些容易讓人誤會「沒有說明」的學術變數名
key，全部都有 `description`，web-nuxt 當時舉的 X1 例子其實已經有說明了。真正缺
`description` 的是像 `epsQuarterly`/`roeQuarterlyPct` 這類「一看名字就懂」的既有指標
變體，這類缺口優先度低，雙方都同意不急著補。

## dataType / subsidiaryCompanyId——一致，僅供確認

mops-ts export schema 跟 analysis-ts 全部一致使用 `dataType`（`'1'`=個別/母公司、
`'2'`=合併）跟 `subsidiaryCompanyId`，沒有落差，列在這裡純粹是完整性——避免有人看到前面
幾項不一致就懷疑這兩個欄位是不是也有問題。
