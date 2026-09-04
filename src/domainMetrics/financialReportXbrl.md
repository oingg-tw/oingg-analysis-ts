# financialReportXbrl 欄位對照表（`financialReportXbrl.csv`）

**這是規劃/參考用的資料，不是程式碼在用的東西**——`financialReportXbrl.csv` 目前沒有被任何
`.ts` 檔案讀取，純粹是先把 oingg-mops-ts 這批新資料源的「哪個欄位屬於哪張表、對應哪個 XBRL
科目代碼」記錄下來，方便之後 mops-ts 排定全市場 backfill、真的要接的時候直接查，不用重新
爬一次對方的 schema。

## 現況（2026-09-05）

mops-ts 主動告知有這批新資料源存在，但**明確說現在不是要我們接**——目前資料庫裡只有
~1101 季測試資料，全市場 backfill 還沒排時間，也還沒討論清楚 analysis-ts 現有 27 支依賴
三大表（`quarterly_income_statement`/`quarterly_balance_sheet`/`quarterly_cash_flow_statement`）
的指標要怎麼 migrate。詳見記憶 `reference_mops_xbrl_datasets`。

## 這是什麼

`financialReportXbrl` 是跟現有三大表平行、互不依賴的另一條路——直接打 MOPS 官方 inline
XBRL 原始文件，用標準化科目代碼（例如 `ifrs-full:ProfitLossBeforeTax`）取代 mops-ts 手工
維護的中文候選標籤清單，拆成 40 張表（`export.<table>_xbrl`）。長期規劃是三大表逐步
sunset、以這個 domain 取代。

## `financialReportXbrl.csv` 欄位說明

一列對應 mops-ts `prisma/schema.prisma` 裡一個 XBRL model 的一個欄位：

| 欄位 | 說明 |
|---|---|
| `tableName` | `export.<tableName>`，實際 view 名稱 |
| `modelName` | mops-ts 那邊的 Prisma model 名稱 |
| `fieldName` | Prisma 欄位名稱（camelCase） |
| `columnName` | 實際資料庫欄位名稱（snake_case，`@map` 出來的） |
| `xbrlCode` | 對應的原始 XBRL 科目代碼（例如 `ifrs-full:Revenue`），從欄位定義行尾的 `//` 註解解析出來；PK/時間戳等非 XBRL 衍生欄位（`symbol`/`year`/`quarter`/`dataType`/`subsidiaryCompanyId`/`reportDate`/`rawContextRef`/`createdAt`/`updatedAt`）這欄是空的 |
| `note` | 補充說明——多半是 `xbrlCode` 之後的中文附註（例如某個代碼在特定產業才適用）；少數欄位（例如 `interestExpense`）沒有單一乾淨的 XBRL 代碼，原本 mops-ts 用 `///` 說明多種代碼要依序嘗試的邏輯，這欄會是完整的說明文字，`xbrlCode` 留空 |

## 資料來源與已知限制

- **來源**：`c:\Users\Chuia\Documents\oingg-mops-ts\prisma\schema.prisma`（第 838~3110 行，
  39 個 XBRL model + `quarterly_balance_sheet`/`quarterly_income_statement` 共 40 張表），
  2026-09-05 用一支腳本解析出來（腳本本身沒有留存，是暫時性工具，不是 analysis-ts 的一部分）。
- **這份 CSV 反映的是 Prisma model 欄位，不是 export view 實際 SELECT 出來的欄位**——
  mops-ts 說 view 是 model 欄位的子集/整理版（分散在三個 migration SQL 檔案裡：
  `20260904012501_add_export_views_financial_report_xbrl`、
  `20260904065814_add_export_views_insurance_securities_ratio_restriction`、
  `20260904134727_add_export_views_general_industry_notes`）。這次沒有逐欄位跟三份
  migration SQL 交叉核對，之後真的要接的時候，要先確認這裡列出的欄位在對應的 view 裡
  真的查得到，不能直接假設 model 有的欄位 view 一定有曝露。
- 40 張表名清單、相容性（PK 結構跟三大表一樣）、不相容之處（欄位命名對齊 XBRL 代碼、
  40 張表之間沒有互相勾稽、商譽抽不到）見 `reference_mops_xbrl_datasets` 記憶的完整說明。
