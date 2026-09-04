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
`indicatorRegistry.ts` 的 job 簽名跟這批指標綁在一起）。**明確排除、沒有動**：
`src/domainApi/companies/`、`src/shared/sourceData/companyProfile.ts` 內部 helper 的
`companyId` 參數命名——這些是呼叫端用位置引數傳值，跟參數名稱無關，且 `companies` 網域
語意上「公司」跟「證券代號」保留一點模糊空間，不勉強統一。

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
| analysis-ts 的 `BetaResult` | `asOfDate`（**同一個服務內部唯一的例外**，其他日資料型指標都叫 `tradeDate`） |
| sitca-ts（ETF）export schema | `year_month`（月快照，不是逐日） |

`BetaResult` 叫 `asOfDate` 而不是跟其他技術指標一樣叫 `tradeDate`，目前沒有查到明確理由
（可能是 beta 這支指標最早實作、命名時還沒定下 `tradeDate` 的慣例）。這是唯一一個「同一
服務內部叫法不一致、且找不到刻意理由」的案例，之後如果剛好要動 `BetaResult` 的 schema，
可以考慮順手改成 `tradeDate` 保持一致；不值得單獨為了這個開一次 migration。

## 產業分類代碼——兩套完全不同的分類系統，容易搞混

- **gov-ts**：`industry_code`/`section_code`/`division_code`/`group_code`/`class_code`/
  `subclass_code`——這是 DGBAS（行政院主計總處）的多層產業分類，`company_industry_classification`
  view 把公司（`stock_code`）對應到這套分類。
- **twse-ts**（2026-09-04 新增）：`export.industry_code`，兩碼代碼對應中文產業名稱
  （例如 `24: 半導體業`）——這是證交所/MOEA 體系的分類，見 `src/shared/sourceData/
  industryCodes.ts`。

這兩套分類**不是同一套代碼系統**，不能互相對照（先前已經確認過 MOEA 營業項目對不上 DGBAS
分類）——看到「產業代碼」時要先確認是哪個來源的，不要假設兩邊代碼可以互換。

## dataType / subsidiaryCompanyId——一致，僅供確認

mops-ts export schema 跟 analysis-ts 全部一致使用 `dataType`（`'1'`=個別/母公司、
`'2'`=合併）跟 `subsidiaryCompanyId`，沒有落差，列在這裡純粹是完整性——避免有人看到前面
幾項不一致就懷疑這兩個欄位是不是也有問題。
