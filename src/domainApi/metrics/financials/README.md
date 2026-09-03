# 財務報表（financials）

- **scope**：Security
- **說明**：損益表/資產負債表/現金流量表的**原始欄位本身**（營收、淨利、總資產⋯⋯），不是算出來的比率——跟 [`../profitability/`](../profitability/README.md)、[`../marginsAndRatios/`](../README.md) 這類「拿財報欄位去算比率」的分類不同，這一類是把財報欄位直接當成可查詢/可 filter 的指標本身。
- **狀態**：⬜ 未實作。
- **來源分類方案**：2026-08-24 討論的「第二套分類方案」之一，見 [`../README.md`](../README.md) 的「第二套分類方案」說明。原始分類表給的項目數是 47，沒有逐項清單；`quarterly_income_statement`/`quarterly_balance_sheet`/`quarterly_cash_flow_statement` 三張表實際欄位數加總約 79 個（不含 PK/時間戳），47 應該是外部分類方案篩過的子集，不是全部欄位，哪些欄位算「財務報表」分類還沒有定案。

## 為什麼還沒做

技術上完全沒有資料缺口——這三張表都已經是本服務讀了快一年的資料源，每支現有 API 內部都在查這些欄位，只是目前只把它們當成「算比率的中間輸入」，回應裡以 `xxx.value`（例如 `operatingRevenue.value`）這種巢狀子欄位形式附帶回傳，沒有獨立開放成「查詢/filter 某個原始財報欄位」這種第一層級的 API。要做這一類，是要決定「要不要把這些欄位提升成一等公民」的介面設計問題，不是缺資料。

## 已知的真實資料來源

`prisma/schema.prisma`（唯讀鏡像 oingg-mops-ts）三張表，摘錄目前已經在某支現有 API 用過的欄位：

- **`quarterly_income_statement`**：`operatingRevenue`、`grossProfit`、`operatingIncome`、`netIncome`、`netIncomeAttributableToParent`、`profitBeforeTax`、`incomeTaxExpense`、`financeCosts`、`rdExpenses`、`sellingExpenses`、`adminExpenses`⋯⋯（共 28 個欄位）。
- **`quarterly_balance_sheet`**：`totalAssets`、`totalLiabilities`、`totalEquity`、`currentAssets`、`currentLiabilities`、`inventory`、`accountsReceivable`、`accountsPayable`、`cashAndEquivalents`、`propertyPlantEquipment`、`retainedEarnings`、`preferredStockCapital`⋯⋯（共 27 個欄位）。
- **`quarterly_cash_flow_statement`**：`netCashFromOperatingActivities`、`netCashFromInvestingActivities`、`netCashFromFinancingActivities`、`capitalExpenditures`、`depreciation`、`amortization`、`dividendsPaid`⋯⋯（共 24 個欄位）。

要做這一類，得先決定：這些欄位要不要沿用現有「查某公司某季」的查詢模板（跟其他 15+ 支 API 一致），還是要支援一次查多欄位/多季度的批次查詢（原始欄位的使用情境常常是「拉一段時間序列」，跟現有「查單一季度算一個比率」的用途不太一樣）。
