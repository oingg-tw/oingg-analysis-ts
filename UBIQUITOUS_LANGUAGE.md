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
不該放在隨時可能被清掉的 `docs/`。**2026-09-08 已完成第一次整合**：下方「〇、與外部
研究報告的落地檢核」逐節核對過建議報告的內容跟本專案實際程式碼的對應關係，不再是兩份
互不相關的文件——之後建議報告如果有新增章節，或本專案新增命名決策時發現跟報告建議
衝突/一致，都應該回來更新這個檢核表，不要讓它變成又一份一次性快照。

**⚠️ 已知重疊，尚未整併**：oingg-conductor-ts 那邊也維護一份涵蓋範圍幾乎一樣的跨服務命名
決策紀錄（2026-09-06 建立，含這裡列的四項對齊決策 + 完整決策過程/dispatch 狀態），目前
放在使用者的 Obsidian vault 裡，因為 vault 正在重整，還沒有穩定的路徑可以在這裡寫死引用
——之後 vault 位置穩定下來，應該回來這裡補上交叉參照，並且明確分工：conductor 那份是
「跨服務決策的完整過程紀錄」，這份是「analysis-ts 視角、給程式碼裡的 schema 註解引用」的
精簡版，避免兩份各自漂移出不一致的內容。

## 〇、與外部研究報告（建議報告.md）的落地檢核（2026-09-08 新增）

[`Ubiquitous Language 建議報告.md`](Ubiquitous%20Language%20建議報告.md) 是 CRSP/
Compustat/供應商 mnemonic 的外部研究資料，本身不是決策——這裡逐節核對報告的建議跟
analysis-ts 實際程式碼現況的對應關係，區分「已經對齊」「刻意不適用」「真正的落差」
三種情況，避免報告內容停在「參考資料」就沒人真的核對過。

| 報告章節 | 建議 | 本專案現況 | 判定 |
|---|---|---|---|
| 一、識別碼 | PERMNO/GVKEY 式永久 surrogate key + 帶生效期間的識別碼歷史表 | 全生態系已統一用 `symbol` 當唯一鍵（見下方一、已完成對齊表），台股 symbol 由主管機關配發、極少重用，不像美股 ticker 會被回收 | **刻意不適用**：symbol reuse 在台股市場不是真實痛點，加一層永久 surrogate key 是不必要的複雜度 |
| 二、`close` vs `last` | 分開 `close_price`（EOD）與 `last_price`（即時 quote） | 全平台只有 `closePrice`（`getStockPriceAsOf` 等）——這個生態系永遠不會有盤中逐筆/分鐘資料 | **刻意不適用**：沒有即時報價來源，`last_price` 概念不存在，`close_price` 已經是唯一且明確的語意 |
| 二、`adjusted` 的多義 | 拆成 `close_raw`/`close_split_adj`/`close_total_return_adj` | 全平台目前**沒有任何價格調整層**——PE/PB/Beta（規劃中）等所有拿股價當輸入的指標一律用原始收盤價，沒有除權息還原、沒有 total-return adjusted 序列 | **真正的落差，但目前刻意擱置**：`exDividendNotice.ts` 只有「未來除權息預告」，沒有「歷史除權息事件」可以拿來算調整因子；等真的需要還原股價（例如報酬率類指標要跨除權息日比較）才需要引入這套三欄位命名，現在硬加只是空殼 |
| 三、`report date` 歧義（`datadate` vs `rdq`/filing date） | 拆成 `fiscal_period_end_date` 與 `filing_date`/`announcement_date` 兩個獨立欄位 | **已完全對齊**：`reportDate`（財報期末日，=`datadate`）與 `knowledgeDate`（實際公告日，=`rdq`）在 `src/domainPitMetrics/knowledgeDate.ts`/`src/models/reportAnnouncementDate.ts` 已經是兩個嚴格分開的欄位，`knowledgeDateIsFallback` 額外標記「查無真實公告日、退回用 reportDate 頂替」的 look-ahead bias 風險——這正是報告點名「最容易造成 bug 的三個陷阱」之一，本專案是目前唯一已經徹底解決的一項 | **已對齊**，命名雖不同（`reportDate`/`knowledgeDate` vs 報告建議的 `fiscal_period_end_date`/`filing_date`）但語意完全一致，不需要改名 |
| 三、TTM vs LTM | 擇一當 canonical，建議 `ttm` | `domainPitMetrics` 的 `basis` 欄位已採用 `'TTM'`（`src/domainPitMetrics/metricBasis.ts`），全平台只用這個字，從未出現 `LTM` | **已對齊** |
| 四、PIT/版本化（bitemporal 設計） | `fiscal_period_end_date`/`filing_date`/`data_vintage`/`is_restated`/`source_version` | `metric_values`（`MetricValue` model）已經是 bitemporal 設計：`fiscalYear`+`fiscalQuarter`=valid time、`knowledgeDate`=transaction/knowledge time；`formulaVersion` 對應 `source_version`；沒有獨立的 `is_restated` 布林欄位，但 `writeMetricValue` 的 `updated_same_knowledge_date`/`inserted` 兩種寫入結果已經隱含「同一天重算覆蓋」vs「新公告日疊加新版本」的區分，效果等價 | **已對齊**，`is_restated` 用寫入結果分支表達而非獨立欄位，是刻意的實作選擇不是遺漏 |
| 五、衍生指標標準命名 | `roe`/`roa`/`roic`/`roce`/`eps`/`bvps`/`ev`/`ebitda`/`fcf`/`beta`/`margin` | `domainPitMetrics` 的 `metricCode` 已經直接採用這些全球通用縮寫（`roe`/`roa`/`roic`/`roce`/`eps`/`bvps`/`evEbitda`/`fcfYield`，`beta` 目前只有 domainMetrics 舊架構版本，pitMetrics 版尚未實作，見本文件〈二、指標識別碼〉一節） | **已對齊** |
| 六、Fama-French 因子 | `mkt_rf`/`smb`/`hml`/`rmw`/`cma`/`umd`/`rf` | 平台沒有任何因子投資/多因子模型功能 | **不適用**，非本平台範圍 |
| 七、WRDS CCM Linking | `GVKEY`↔`LPERMNO` 橋接 + 有效期間 | 沒有 CRSP/Compustat 概念；生態系內部的跨服務橋接鍵已經是 `symbol`（見一、已完成對齊）跟 `fund_tax_id`（見二、指標識別碼、ETF 相關 join），且都沒有帶生效期間——這是台股單一市場場景，橋接鍵本身穩定，不像 CCM 要處理兩個獨立資料庫的覆蓋範圍落差 | **不適用**，場景不對應 |
| 八、籌碼資料（台灣概念對應） | `short_to_margin_ratio`/`margin_purchase_balance`/`short_sale_balance`/`foreign_net`（買賣超） | `marginShortRatioRanking` 的 `shortToMarginRatioPct` 已對齊報告建議的 `short_to_margin_ratio`；`marginTodayBalance`/`shortTodayBalance` 概念對應 `margin_purchase_balance`/`short_sale_balance`，但命名用「Today」而非報告建議的字面對應，語意仍清楚不算落差。外資「買賣超」（`foreign_net`，net buy/sell flow）目前完全沒做——2026-09-08 twse-ts 退役了唯一涵蓋「外資持股比例」（ownership level，跟買賣超是不同概念）的 `export.foreign_holding`，`foreignHoldingRanking` 這個排行功能（`src/api/bff/market/foreignHoldingRanking/`）已經整批移除，不再有任何外資相關籌碼指標 | **部分對齊**：往後如果真的要做外資「買賣超」，metricCode/欄位名稱要用 `foreignNet`（或類似字眼），跟已經移除的舊 `sharesHeldPercent`（持股比例）概念明確區分，不要都叫「外資」混在一起 |
| 九、市場結構詞彙 | universe/constituent/reconstitution/rebalancing | 平台沒有指數複製、成分股追蹤、universe 篩選這類功能 | **不適用**，非本平台範圍 |

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

1. ~~`filterCatalog.ts` 的 `metricKey.fieldKey`~~（camelCase）——**2026-09-08 整套機制
   已經完全退場**：「每指標一表」架構的最後 3 張表（`BetaResult`／`MarketRatiosResult`／
   `EquityRiskPremiumResult`）已經 DROP TABLE（`EquityRiskPremiumResult` 其實不算這套
   「指標」的一員，是獨立的總經資料，但也已刪除），`filterCatalog.ts`/`filterCatalog.csv`/
   `metricTableRegistry.ts`/`columnPresets.ts`/`GET /companies/metrics`（compute-on-miss）/
   `POST /screener/values`/整個 `GET /screener` 系列全部刪除，不再存在。`GET /filters`
   現在改成直接掃描 `src/domainPitMetrics/` 資料夾結構產生（見
   `src/api/bff/filter/metricFolderCatalog.ts`），回應形狀也變了（只有
   `categoryKey`/`metricCode`/`allowedBases`，沒有這套系統原本的 `metricKey.fieldKey`
   camelCase 識別碼、也沒有使用者可讀的 name/description/unit 文案）。
2. **`domainPitMetrics` 的 `metric_code` + `basis`**（snake_case metric_code）——point-in-time
   架構（`metric_values`/`metric_definitions`，見 ROE spike）用這套，例如
   `metric_code='roe'`、`basis='Q'`。
3. **mops-ts XBRL account_code**（snake_case，`export.xbrl_three_statements_long` 的
   `account_code` 欄位）——**2026-09-06 起 `domainPitMetrics` 的 `dependsOn` 改填這一套**（見下方
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

- **`domainPitMetrics` 的 `dependsOn` 曾經只能填 mops-ts 三大表的原始欄位名稱**——因為 XBRL
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
  （`src/domainPitMetrics/bankAssetQuality/`、`src/domainPitMetrics/bankCapitalAdequacy/`）。**原本這裡
  記錄的表名是錯的**：`non_performing_receivables_xbrl` 只有信用卡業務/應收帳款受讓業務
  兩個類別，不是全行放款逾放比；真正對的表是 `bank_asset_quality_xbrl`（`category=
  'TotalLoans'` 那一列才是全行加總，覆蓋約 19-20 檔銀行/金控股，每季都有真實值）。
  `bank_capital_adequacy_detail_xbrl` 可用（CET1/Tier1 已算好，CAR 要自己除），但只覆蓋
  6-7 檔股票，且監理揭露頻率本來就是半年一次（只有 Q2/Q4 有真實值，Q1/Q3 一律 null，不是
  資料缺漏）。`eligible_capital_composition_xbrl`（3593 列僅 33 列非 null）、
  `bank_npl_disposal_xbrl`（呆帳處分交易紀錄，不是比率）這批沒有做，涵蓋率太低/形狀不合。

### 已結案（原「尚未解決的落差」，2026-09-11 更新）

- ~~`metricKey`（filterCatalog）跟 `metric_code`（pitMetrics）目前只是碰巧同名~~——
  **這條落差已經不存在**：filterCatalog 整套機制（`filterCatalog.ts`/`.csv`/
  `metricTableRegistry.ts` 等）已於 2026-09-08 整批刪除（見上方「二、指標識別碼」
  第 1 項），不再有 `metricKey` 這個識別碼系統可以跟 `metric_code` 碰巧同名或分家，
  這條記錄純粹是文件沒有跟著程式碼刪除同步更新，這次一併清掉。

### 持續適用的原則

- **命名落差真的要解決時，優先選擇改 DB**（即使要做破壞性 migration、重新命名欄位）
  去對齊 XBRL/國際慣例，不要蓋一層「內部命名 ↔ XBRL」的轉換層讓內部命名維持不變
  （2026-09-06 確認）——跟本文件第一節列的四項硬切對齊決策同一種做法，不是「落差」，
  是往後任何新落差出現時都要套用的既定原則，跟上方已結案的具體案例分開列。

## 三、期間口徑：「第四季」只代表單季，「年報」是另一個概念（2026-09-25 使用者拍板）

| 詞 | 定義 | 讀哪裡 |
|---|---|---|
| **單季（Q）** | quarter=1~4 **全部**是單季；第四季 = 年報全年 − (Q1 + Q2 + Q3 單季)（mops-ts 的推導式，見他們的 `deriveQ4XbrlAmounts.ts`；EPS 不推導，第四季單季 EPS 一律 null）。**第四季絕不代表全年** | `quarterly_income_statement_xbrl`、長表 `cash_flow_quarterly`、銀行/保險表的 `*_quarter` 欄位（`QuarterlyKey` 讀的都是這些） |
| **近四季（TTM）** | 四個單季相加 | 由單季相加，不讀累計表 |
| **年報** | 公司年度財務報告的全年數字，含官方公告的基本每股盈餘（加權平均股數） | 累計表的第四季（`cumulative_income_statement_xbrl` quarter=4、長表 `cash_flow`／`income_statement_cumulative` quarter=4）**而且必須是年報文件解析出來的列**（寬表 `raw_context_ref` 非 null）——沒 ingest 過年報的公司，mops-ts 會用四個單季相加補一列累計第四季（114 年 773 列），那不是年報。讀取介面：`AnnualReportPort`（不帶季別，只認文件列）。另開明確的 `export.annual_income_statement` 待 mops-ts 的使用者同意 |

**為什麼要硬性區分**：台灣沒有「第四季季報」，第四季單季是 mops-ts 從年報減前三季推出來的。
兩者共用 quarter=4 這個座標，一旦單季表的第四季混進年報的全年數字，近四季會安靜地變成
「前三季 + 全年」，數字看起來仍然合理、也不會報錯。2026-09-25 實測（營收一個科目、6,081 個
四季齊全的公司年度）：確定壞在單季第四季的 5 筆（4760 113 年直接等於全年＝推導在 Q1~Q3 入庫前
就跑了、之後沒重推；5348/5543/6776/6811 114 年四季相加 ≠ 全年）；另 114 筆單季與累計對不上但
分不出哪一側壞（1439 111 年是累計側壞），已交 mops-ts 逐筆判斷。現金流量表 8,009 筆、銀行 15 筆正確。

**檢查方法的陷阱**：不要拿累計表當標準答案驗單季（累計側自己也會壞）；「四季單季相加 == 全年」
在 mops-ts 的推導式下只要推導有跑就恆成立，不能證明單季正確——前三季單季高估時差額會被第四季
吸收（2905 114 年第四季營收為負）。mops-ts 會在來源端守 (i) Q1 單季 == Q1 累計、(ii) Q1~Q3 單季和
== Q3 累計、(iii) Q4 單季 == 全年 − Q3 累計。

**規則**：
- `QuarterlyKey` 的 `quarter` 只能拿到單季。要年報的全年數字，走**不帶季別參數**的年報讀取
  介面（做 FY 口徑時才建），不准用 `quarter: 4` 去累計表撈。
- 每股數字：年報 EPS 用加權平均股數；analysis-ts 的每股指標目前用報告日當下的期末股本
  （2026-09-25 實測 112~114 年近四季 EPS 跟年報 EPS 差 ≤0.01 的只有 65%）——不同口徑，不能混著比。
- 既有 11 支 `periodType='FY'` 指標（chowderNumber、dividendGrowthRate 家族、epsCagr 家族等）
  仍是四個單季相加，不是讀年報；股利類的 FY 是「當年度付出去的現金」，不是盈餘所屬年度。

## 四、股利來源與盈餘發放率（2026-09-25 使用者拍板）

MOPS 股利公告（t108sb27）的原始表頭，mops-ts 從快取的原始 HTML 逐字抽出：
「盈餘分配之股東現金股利(元/股)」、「法定盈餘公積、資本公積發放之現金(元/股)」、「盈餘轉增資配股(元/股)」、
「法定盈餘公積、資本公積轉增資配股(元/股)」、「特別股配發現金股利(元/股)」。**法定盈餘公積與資本公積在公告裡
合在同一欄，拆不開**（mops-ts 的欄位名 `*_from_capital_reserve` 漏了法定盈餘公積，他們會在 schema 註解補上原名）。

| 詞 | 定義 | 出現在哪 |
|---|---|---|
| **現金股利（合計）** | 一次分派決議的每股現金，= 盈餘分配 + 法定盈餘公積與資本公積發放 | `dividend-history` 的 `cashDividend` |
| **盈餘分配** | 公告的「盈餘分配之股東現金股利」。**可能含以前年度累積的未分配盈餘**，不一定是當年賺的 | `cashDividendFromEarnings` |
| **法定盈餘公積與資本公積發放** | 公告的「法定盈餘公積、資本公積發放之現金」，兩種合在一欄：資本公積部分性質是退還股本，法定盈餘公積則是以前年度盈餘提存的 | `cashDividendFromLegalReserveAndCapitalSurplus` |
| **盈餘發放率** | 盈餘分配 ÷ 當年 EPS × 100——只算公告的盈餘分配欄。全部來自公積時是 0%；EPS ≤ 0 時不算 | `dividend-history` 的 `payoutRatio`（2026-09-25 起；之前分子是合計，2882 國泰金 111 年因此顯示 34.88%，實際盈餘分配 0%） |

**「當年盈餘 vs 以前年度盈餘」**：股利公告不分。只能單向推——盈餘分配 > 當年 EPS 時一定動用了以前年度盈餘；
≤ 時什麼都證明不了（bff-ts 量到只有約一成公司年度推得出）。但**不是完全沒有資料**：提列法定／特別盈餘公積、
現金股利、股票股利的實際發生數在 XBRL 權益變動表（mops-ts `equity_change_xbrl`，逐 RetainedEarningsMember／
LegalReserveMember／CapitalReserveMember 有期初、變動、期末），加上資產負債表的期末未分配盈餘，「期初未分配盈餘
→ 本期淨利 → 提列 → 可供分配」每一項都有來源，只是分散、而且是**帳上實際發生**，不是股東會的**決議**內容。
決議口徑的報表是 MOPS t05st09（股利分派情形－經股東會確認），mops-ts 還沒抓過。目前都沒接。

**同名不同口徑的地雷**：指標 `dividendPayoutRatio`（型錄名稱也叫盈餘發放率）用的是**現金流量表**的「發放現金股利」
÷ 近四季淨利。現金流量表那一行**包含公積發放**（實測 2882 國泰金 2023 年每股 1.024 元＝111 年度公積發放 0.9 元加特別股
股利），而且只有合計、拆不出來源，所以分子跟 `payoutRatio` 不同，文案已寫明。另外它還有「分子是付款年度、分母是
盈餘年度」的期間錯位（見 metricNarratives 的 dividendPayoutRatio）。兩者**不要互相驗證**。
