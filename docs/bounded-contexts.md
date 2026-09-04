# 領域邊界（Bounded Contexts）

這份文件把目前已經隱性存在、但沒有寫下來的邊界劃分明確化——只做 DDD 的**戰略設計**（Bounded Context / Context Mapping / Anti-Corruption Layer），不引入 Aggregate/Entity/Repository 這類戰術設計。理由見 `README.md`「架構」一節的討論：這個服務目前每支指標都是「查資料→算數字→upsert」的無狀態計算函式，沒有跨多筆記錄的業務不變量需要保護，戰術 DDD 換不到實際好處。

2026-08-31 建立，之後架構邊界異動要記得回來更新這份文件，不要讓它變成過期的裝飾品。

## 生態系層級的 Context Map

analysis-ts 是 oingg 生態系裡的**數據中台**：不擁有任何原始資料的採集邏輯，負責把多個後台的資料整合、二次加工成指標。

| 對方 context | 關係型態 | 說明 |
|---|---|---|
| oingg-mops-ts | **Anti-Corruption Layer**（2026-08-31 起，pilot 完成） | 透過 `export` schema + `etl_reader` role + `ingestion_runs` 握手表，中台自己有一份 curated 副本，不即時查對方 DB。見下方「資料層的 Context 對應」。 |
| oingg-twse-ts / oingg-gov-ts / oingg-tpex-ts | **Conformist**（過渡狀態，遷移中） | 目前還是直連對方唯讀鏡像資料庫，全盤接受對方的 schema 形狀，沒有防腐層。已經請三邊依照 mops-ts 的模式建 `export` schema，遷移完成後會升級成 Anti-Corruption Layer。 |
| oingg-sitca-ts | **尚未整合** | 對方已有 `fund_expense_ratio_annual`/`fund_lifecycle_event` 兩個 dataset，analysis-ts 目前沒有基金相關指標，還沒有消費關係。 |
| oingg-bff-ts | **Open Host Service / Published Language**（我們是上游） | 對方消費我們的 `GET /filters` API，我們發布穩定的公開契約，但**明確不知道對方存在**——2026-08-31 使用者定調：analysis-ts 不持有 bff-ts 的密鑰、不呼叫對方、不因為對方存在而改變行為（原本設計的 `/filters/sync` 通知端點因此整個移除）。這是比一般 Open Host Service 更嚴格的版本：連「知道消費者是誰」都不允許。 |
| oingg-conductor-ts | **旁觀者，不消費資料** | 站在最上層做生態系觀測，不擁有業務 domain，不是資料流的一部分，見 `README.md`。 |

## analysis-ts 內部的 Bounded Context 劃分

| Context | 位置 | 擁有的資料模型 | 對外介面 | 明確不做的事 |
|---|---|---|---|---|
| **metrics** | 計算邏輯在 `src/domainBatch/metrics/`；`src/domainApi/metrics/` 現在只剩 3 支不是「單一公司查詢」語意的例外（`valuation/ranking`、`macro/equityRiskPremium`、`macro/govBondYield10y`） | `prisma/analysis/schema.prisma` 裡「算完的指標結果」那組表（RoeResult、PsrResult…） | `GET /companies/metrics`（2026-09-04 起單一公司多指標 consolidated 查詢，取代原本 44 支各自的 `GET /<分類>/<指標>`）+ 上述 3 支例外各自的 `GET /<分類>/<指標>` | 不處理特別股/REITs/ETF 這類非「公司季度財報」骨架的證券；不知道 filter/sync 這兩個 context 內部怎麼運作 |
| **filter** | `src/domainApi/filter/` | 無自己的資料表——`filterCatalog.ts` 是靜態登錄檔，`filterCatalogCheck.ts` 對照 `prisma/analysis/schema.prisma` 做一致性檢查 | `GET /filters` | 不計算任何指標，純粹是 metrics context 產出的 metadata 目錄 |
| **preferredStock** | `src/domainApi/preferredStock/` | 未實作，規劃中 | 未實作 | 不共用 metrics context「公司+季度財報」的資料模型假設——特別股是獨立證券，不是公司的一個欄位 |
| **system** | `src/domainApi/system/` | 無 | `GET /`（root，健康檢查用途） | 純基礎設施，不含任何業務邏輯 |
| **sync engine** | `src/shared/sync/` | `prisma/analysis/schema.prisma` 裡 `sync_state` + `curated_<backend>_<dataset>` 那組表 | 無 HTTP 對外介面（2026-08-31 `POST /system/sync/:backend/:dataset` 被使用者要求移除，目前用臨時腳本手動觸發） | 不計算任何指標，只負責把後台 `export` schema 的資料同步進 curated 層；不知道 curated 層之後會被哪個 context 消費 |

## 資料層的 Context 對應（每個 Prisma schema = 一個實體邊界）

| Prisma schema | 擁有者 | 關係型態 | 用途 |
|---|---|---|---|
| `prisma/schema.prisma` | oingg-mops-ts（唯讀鏡像） | Conformist（過渡中，季度財報三張表還沒切到 curated 層） | metrics context 目前的資料來源 |
| `prisma/twse/schema.prisma` | oingg-twse-ts（唯讀鏡像） | Conformist（過渡中） | metrics context（Beta、technicals、valuation）的資料來源 |
| `prisma/gov/schema.prisma` | oingg-gov-ts（唯讀鏡像） | Conformist（過渡中） | 無風險利率、ERP 計算的資料來源 |
| `prisma/tpex/schema.prisma` | oingg-tpex-ts（唯讀鏡像） | Conformist（過渡中） | 上櫃市場排行/估值資料來源 |
| `prisma/mopsExport/schema.prisma` | oingg-mops-ts（`export` schema，`etl_reader` 唯讀） | **Anti-Corruption Layer** | sync engine 專用，翻譯層在 `src/shared/sync/mopsQuarterlyIncomeStatementSync.ts` |
| `prisma/analysis/schema.prisma` | analysis-ts 自己擁有 | 無（這是我們自己的 context） | metrics context 的指標結果表 + sync engine 的 curated/watermark 表，兩種用途共用同一個實體資料庫，但概念上是兩個不同 context 的資料，見該檔案開頭註解 |

## 這份劃分目前的已知缺口

- twse/gov/tpex 三邊還沒完成 Anti-Corruption Layer 遷移（已發出邀請，等後台回覆）——在完成前，這三個 context 的邊界對外是清楚的（各自獨立 schema），但對內（跟 metrics context 的耦合方式）還是 Conformist，改動風險跟 mops 遷移前一樣。
- `metrics` context 尚未切換成讀 curated 層，目前 curated 層（mops pilot）跟 metrics context 是兩條平行、互不相干的資料路徑——這是刻意的分階段策略，不是遺漏，見 `C:\Users\Chuia\.claude\plans\abstract-crafting-journal.md` 的「下一步」。
