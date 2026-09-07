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
文件是跨服務都在引用的參考資料，需要更高的持久性保證。**2026-09-07 印證過這個判斷**：
`docs/` 底下兩份規格草案（`analysis-ts-spec.md`/`analysis-ts-spec-v0.2.md`）因為描述的
「現況」跟「目標架構」都已經是過去式（point-in-time 架構已經全部落地、v0.2 提案裡的
45 張舊表已經砍到剩 3 張），直接刪除；同一批清理把外部命名慣例研究資料
[`Ubiquitous Language 建議報告.md`](Ubiquitous%20Language%20建議報告.md)（CRSP/Compustat/
供應商 mnemonic 對照，用來輔助命名決策的參考資料，不是本文件這種「已經做過的決策紀錄」）
從 `docs/` 移到根目錄一起正式進版控，理由跟這份文件一樣：這是會被重複引用的參考資料，
不該放在隨時可能被清掉的 `docs/`。

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

1. **`filterCatalog.ts` 的 `metricKey.fieldKey`**（camelCase）——**2026-09-07 使用者要求
   把「每指標一表」架構裡的 34 張表整批 DROP**（這批全部已經有 pitMetrics 版本可查），
   目前只剩 3 張沒有 pitMetrics 替代版本的表（`BetaResult`／`MarketRatiosResult`／
   `EquityRiskPremiumResult`，後者其實不算這套「指標」的一員，是獨立的總經資料）。
   `filterCatalog.csv` 現在只剩 `portfolio`（beta）跟 `valuation` 的 `per`/`pbr`/
   `dividendYield`（marketRatios）共 6 列，`GET /companies/metrics`、
   `POST /screener/values` 這套定址系統本身還在，只是背後的表已經大幅縮減，不要再假設
   這套系統涵蓋 45（或 37）支指標。
2. **`pitMetrics` 的 `metric_code` + `basis`**（snake_case metric_code）——point-in-time
   架構（`metric_values`/`metric_definitions`，見 ROE spike）用這套，例如
   `metric_code='roe'`、`basis='Q'`。
3. **mops-ts XBRL account_code**（snake_case，`export.xbrl_three_statements_long` 的
   `account_code` 欄位）——**2026-09-06 起 `pitMetrics` 的 `dependsOn` 改填這一套**（見下方
   「已解決的落差」），例如 `profit_loss_attributable_to_owners_of_parent`、
   `equity_attributable_to_owners_of_parent`。這是 mops-ts 自己把原始 XBRL 標籤整理過的
   命名，不是 IFRS 原始 PascalCase 標籤，也不是 mops-ts 三大表（`quarterly_income_statement`/
   `quarterly_balance_sheet`）原本的 camelCase 欄位名稱（`netIncomeAttributableToParent`
   這種，2026-09-06 之前 `dependsOn` 填的是這一套，現在已經不用了，但三大表本身的實際
   欄位名稱沒有變，計算邏輯依然讀這兩張表，只有 `dependsOn` 的宣告內容改變）。
4. **mops-ts 三大表原始欄位名稱**（camelCase，`quarterly_income_statement`/
   `quarterly_balance_sheet` 實際的表欄位，例如 `netIncomeAttributableToParent`）——
   這是實際計算時真正查詢的欄位，涵蓋 249 家公司；跟上面第 3 套（XBRL account_code，
   目前只涵蓋 3 家公司）是同一組會計概念的兩種不同命名系統，`dependsOn` 現在記錄的是
   XBRL 那一套名稱，但程式碼實際查資料庫用的還是這一套 camelCase 欄位名稱——兩者的對應
   關係見下方示範表格。

### 示範：2330（台積電）115Q2 ROE 走過這幾層系統

用這個 session 已經實測驗證過的真實數字（不是虛構範例）：

| 層級 | 內容 |
|---|---|
| mops-ts 三大表原始欄位（實際計算查詢的來源，249 家公司覆蓋） | `netIncomeAttributableToParent = 706561938`（千元，淨利歸屬母公司）<br>`equityAttributableToParent = 6432518334`（千元，權益歸屬母公司） |
| mops-ts XBRL account_code（**2026-09-06 已拿 2330 真實資料驗證過**，見下方說明） | `profit_loss_attributable_to_owners_of_parent` 對應 `netIncomeAttributableToParent`<br>`equity_attributable_to_owners_of_parent` 對應 `equityAttributableToParent` |
| 計算結果 | ROE（單季）= 706561938 / 6432518334 × 100 ≈ **10.98%** |
| filterCatalog 定址 | `metricKey="roe"`, `fieldKey="roeQuarterlyPct"` → `roe.roeQuarterlyPct` |
| pitMetrics 定址 | `metric_code="roe"`, `basis="Q"` → `value=10.98`；`dependsOn=['profit_loss_attributable_to_owners_of_parent','profit_loss','equity_attributable_to_owners_of_parent','equity']` |

**驗證方式**：直接查詢 mops-ts 的 `export.xbrl_three_statements_long`（2330 目前有 902
筆不同 `account_code`），確認 `profit_loss_attributable_to_owners_of_parent`/
`equity_attributable_to_owners_of_parent`/`assets`/`equity`/`revenue`/`profit_loss`
這幾個名稱真實存在於 2330 的 XBRL 資料裡，不是照 IFRS 標準科目名稱推論——上一版本這裡
寫的是 `ifrs-full:` 開頭的推論值，2026-09-06 已經拿真實資料修正掉。

### 已解決的落差（原「已知落差」，2026-09-06 更新）

- **`pitMetrics` 的 `dependsOn` 曾經只能填 mops-ts 三大表的原始欄位名稱**——因為 XBRL
  資料當時只涵蓋測試公司 1101，沒有真實公司可以驗證對應關係。**mops-ts 2026-09-06 補上
  2330（台積電）、2801（彰化銀行）兩家真實公司的 XBRL 資料後，這個落差已經解決**：
  `metricDefinitionRegistry.ts` 的 `dependsOn` 陣列已經全部改成驗證過的 XBRL
  account_code（見上方示範表格）。**2026-09-07 更新：這已經不只是宣告欄位的改動**——
  現金流量表/資產負債表/損益表依賴的全部 PIT 指標都已經換源成「XBRL 寬表/長表優先，
  查無資料才 fallback 舊三大表」（`balanceSheetXbrlFirst.ts`/`incomeStatementXbrlFirst.ts`/
  `cashFlowStatementXbrlFirst.ts`），**實際計算現在真的是 XBRL 優先**，不是只有
  `dependsOn` 這個宣告字串變了、計算來源沒變——這段話跟舊版本說的「沒有切換去讀 XBRL
  表」已經不成立，XBRL 目前覆蓋約 745 家公司（資產負債表/損益表）、722 家（現金流量表），
  遠超過舊三大表的 247~249 家，但不是嚴格超集合（部分公司/季度組合舊表有但 XBRL 沒有），
  fallback 機制仍然必要。舊架構 37 張表內部存的欄位挑選紀錄（例如 `RoeResult.
  netIncomeFieldUsed`）已經隨著 2026-09-07 那批表刪除一起消失，不再是「不動」的狀態，
  是「已經不存在」。之後新增 `metricDefinitionRegistry` entry 時，`dependsOn`
  應該優先查 `export.xbrl_three_statements_long`/寬表有沒有對應的 account_code 可用，
  沒有的話才退回填三大表原始欄位名稱。
- **2026-09-06 已解決**（原「意外發現，還沒評估細節」）：銀行業專屬指標（CAR/CET1/Tier1/
  逾放比/備抵呆帳覆蓋率）已經直接查 mops-ts export DB 驗證過並實作完成
  （`src/pitMetrics/bankAssetQuality/`、`src/pitMetrics/bankCapitalAdequacy/`）。**原本這裡
  記錄的表名是錯的**：`non_performing_receivables_xbrl` 只有信用卡業務/應收帳款受讓業務
  兩個類別，不是全行放款逾放比；真正對的表是 `bank_asset_quality_xbrl`（`category=
  'TotalLoans'` 那一列才是全行加總，覆蓋約 19-20 檔銀行/金控股，每季都有真實值）。
  `bank_capital_adequacy_detail_xbrl` 可用（CET1/Tier1 已算好，CAR 要自己除），但只覆蓋
  6-7 檔股票，且監理揭露頻率本來就是半年一次（只有 Q2/Q4 有真實值，Q1/Q3 一律 null，不是
  資料缺漏）。`eligible_capital_composition_xbrl`（3593 列僅 33 列非 null）、
  `bank_npl_disposal_xbrl`（呆帳處分交易紀錄，不是比率）這批沒有做，涵蓋率太低/形狀不合。

### 尚未解決的落差

- **`metricKey`（filterCatalog）跟 `metric_code`（pitMetrics）目前只是碰巧同名**，沒有
  正式的程式碼對照表，兩套系統各自獨立維護。如果之後有指標在兩邊取了不同名字，不會有
  任何自動化機制抓出來。
- **原則維持（2026-09-06 再次確認）**：命名落差真的要解決時，優先選擇改 DB（即使要做
  破壞性 migration、重新命名欄位）去對齊 XBRL/國際慣例，不要蓋一層「內部命名 ↔ XBRL」的
  轉換層讓內部命名維持不變——跟本文件第一節列的四項硬切對齊決策同一種做法。
