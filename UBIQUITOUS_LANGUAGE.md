# Ubiquitous Language：oingg 生態系跨服務命名對照

這份文件記錄 oingg 生態系（analysis-ts + 上游來源服務 twse-ts/tpex-ts/mops-ts/gov-ts/
sitca-ts）之間已經做過的命名對齊決策，以及 analysis-ts 內部多套指標識別系統之間的對照。
`prisma/analysis/schema.prisma`、`prisma/govExport/schema.prisma`、
`prisma/sitcaExport/schema.prisma`、`prisma/tpexExport/schema.prisma` 這幾份 schema
裡有多處註解引用這份文件——**這是一份持續維護的文件，不是一次性報告**：之後任何一次
跨服務命名對齊、或 analysis-ts 內部指標識別系統的新增/調整，都應該回來補一筆到這裡，並
在改動的程式碼/schema 註解裡引用本檔案，不要讓「見 UBIQUITOUS_LANGUAGE.md」變成新的
斷link。

放在 repo 根目錄（不是 `docs/`）是刻意的——`docs/` 是隨手筆記，內容可能隨時被清掉，這份
文件是跨服務都在引用的參考資料，需要更高的持久性保證。

**⚠️ 已知重疊，尚未整併**：oingg-conductor-ts 那邊也維護一份涵蓋範圍幾乎一樣的跨服務命名
決策紀錄（2026-09-06 建立，含這裡列的四項對齊決策 + 完整決策過程/dispatch 狀態），目前
放在使用者的 Obsidian vault 裡，因為 vault 正在重整，還沒有穩定的路徑可以在這裡寫死引用
——之後 vault 位置穩定下來，應該回來這裡補上交叉參照，並且明確分工：conductor 那份是
「跨服務決策的完整過程紀錄」，這份是「analysis-ts 視角、給程式碼裡的 schema 註解引用」的
精簡版，避免兩份各自漂移出不一致的內容。

## 一、已完成的跨服務命名對齊

| 舊名 | 新名 | 服務 | 日期 | 理由 |
|---|---|---|---|---|
| `stockCode` / `security_code` | `symbol` | twse-ts / tpex-ts / mops-ts / gov-ts / sitca-ts | 2026-09-04 | 同一個「股票代號」概念，五個服務原本各自叫法不同，統一成 `symbol`。 |
| `fund_id` | `fund_tax_id` | sitca-ts（`FundExpenseRatioAnnual`） | 2026-09-04 | 跟同服務 `EtfMonthlyStatement` 既有的 `fund_tax_id`（基金統編）是同一個概念，改名前兩邊叫法不一致。 |
| `market` | `source` | tpex-ts（`CompanyProfile`） | 2026-09-04 | 原本叫 `market`容易誤會成「TWSE/TPEx 市場別」，實際存的是上櫃/興櫃登記類別（`COMPANY_PROFILE`/`COMPANY_PROFILE_EMERGING`），改名消除歧義。 |
| `as_of_date` | `trade_date` | analysis-ts（`BetaResult`） | 2026-09-04 | 跟其他逐日型結果表（8 支已刪除的 technicals、`MarketRatiosResult`）的日期欄位統一叫法，這是同一批表裡唯一的命名例外。 |

以上四項全部是「硬切」（hard cutover，無過渡期，dev/prod 一次到位），不是漸進式雙寫。

## 二、指標識別碼：三套平行系統的對照

analysis-ts 內部同時存在三套用來指涉「同一個財務指標」的識別碼系統，彼此沒有正式的程式碼
層級對照表（各自獨立演進，只是碰巧常常同名）：

1. **`filterCatalog.ts` 的 `metricKey.fieldKey`**（camelCase）——現有 45 張
   「每指標一表」架構、`GET /companies/metrics`、`POST /screener/values` 用這套定址，
   例如 `roe.roeQuarterlyPct`。
2. **`pitMetrics` 的 `metric_code` + `basis`**（snake_case metric_code）——point-in-time
   架構（`metric_values`/`metric_definitions`，見 ROE spike）用這套，例如
   `metric_code='roe'`、`basis='Q'`。
3. **mops-ts 原始欄位名稱**（camelCase，跟三大表 `quarterly_income_statement`/
   `quarterly_balance_sheet` 對應）——例如 `netIncomeAttributableToParent`、
   `equityAttributableToParent`，是 `pitMetrics` 目前 `dependsOn` 唯一能填的內容
   （見下方「已知落差」）。
4. **XBRL IFRS Full Taxonomy 標籤**（未來的第四套，`ifrs-full:` 前綴）——mops-ts 的
   `financialReportXbrl`（40 張表）長期要取代三大表的資料源，目前還在測試階段（僅測試
   公司 1101），還沒有任何 analysis-ts 程式碼引用這套標籤。

### 示範：2330（台積電）115Q2 ROE 走過這四層系統

用這個 session 已經實測驗證過的真實數字（不是虛構範例）：

| 層級 | 內容 |
|---|---|
| mops-ts 原始欄位（現況資料源） | `netIncomeAttributableToParent = 706561938`（千元，淨利歸屬母公司）<br>`equityAttributableToParent = 6432518334`（千元，權益歸屬母公司） |
| XBRL IFRS Full Taxonomy 標籤（**公開標準名稱，不是查證 mops-ts 實作結果**，見下方警語） | `ifrs-full:ProfitLossAttributableToOwnersOfParent` 對應 `netIncomeAttributableToParent`<br>`ifrs-full:EquityAttributableToOwnersOfParent` 對應 `equityAttributableToParent` |
| 計算結果 | ROE（單季）= 706561938 / 6432518334 × 100 ≈ **10.98%** |
| filterCatalog 定址 | `metricKey="roe"`, `fieldKey="roeQuarterlyPct"` → `roe.roeQuarterlyPct` |
| pitMetrics 定址 | `metric_code="roe"`, `basis="Q"` → `value=10.98`；`dependsOn=['netIncomeAttributableToParent','netIncome','equityAttributableToParent','totalEquity']` |

**⚠️ 重要警語**：上面「XBRL 標籤」那一列填的是 IFRS Full Taxonomy 公開發布的標準科目
名稱（全球通用、跟哪家公司無關，任何人都查得到），**不是**去查證 mops-ts 的
`financialReportXbrl` 資料集裡 2330 實際被標記的標籤——那個資料集目前只有測試公司 1101
（台泥），還沒有 2330 的資料可查。這一列的用途是示範「概念上將來會怎麼對應」，不是「已經
驗證過的事實」，等 mops-ts 的 XBRL 資料真的涵蓋到 2330 之後，應該回來對照真實資料修正
（或確認）這一列，不要假設這裡寫的標籤名稱一定跟 mops-ts 實際 ingest 的結果一致。

### 已知落差（這份對照表記錄下來，不是這次要解決的技術債）

- **`metricKey`（filterCatalog）跟 `metric_code`（pitMetrics）目前只是碰巧同名**，沒有
  正式的程式碼對照表，兩套系統各自獨立維護。如果之後有指標在兩邊取了不同名字，不會有
  任何自動化機制抓出來。
- **`pitMetrics` 的 `dependsOn` 目前只能填 mops-ts 原始欄位名稱**（`netIncomeAttributableToParent`
  這種），不是 canonical account code——因為 canonical 科目詞彙還不存在，等 XBRL 真的
  接上後，`dependsOn` 應該改成存 `ifrs-full:` 標籤，而不是現在的 mops 原始欄位名稱，
  屆時這份文件的「示範」表格也要跟著更新成真實驗證過的對照，不能再依賴標準標籤名稱推論。
  **原則已定調（2026-09-06，使用者明確要求）**：這個落差真的要解決時，優先選擇改 DB
  （即使要做破壞性 migration、重新命名欄位）去對齊 XBRL/國際慣例，不要蓋一層「內部命名
  ↔ XBRL」的轉換層讓內部命名維持不變——跟本文件第一節列的四項硬切對齊決策同一種做法，
  不是為了相容性保留舊命名。

### 這次刻意排除的範圍

- 不接真實 XBRL 資料——mops-ts 的 `financialReportXbrl` 還在測試階段（僅 1101 一家），
  接資料是之後的事，這次只做命名概念設計。
- 不修改 `metricDefinitionRegistry.ts`/`filterCatalog.ts` 等任何現有程式碼——這份文件
  純粹是命名對照的參考資料，程式碼要不要照著改是之後真的要接 XBRL 時的決定。
