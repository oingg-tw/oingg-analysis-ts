# 指標公式表（`metricFormulas.csv`）

**規劃/參考用，不是程式碼在用的東西**——跟 `financialReportXbrl.csv`/`1101.csv` 一樣，目前
沒有任何 `.ts` 檔案讀取這個 CSV，之後要拿來管理 metrics/filter 時再接上。

## 欄位說明

一列定義一個複合指標（需要用其他數值算出來的指標），不是原始欄位本身：

| 欄位 | 說明 |
|---|---|
| `code` | 這個指標的代號，之後可以被別的列的 `operand1Code`/`operand2Code` 引用 |
| `nameEn` | 投資人看得懂的英文名稱 |
| `nameZh` | 投資人看得懂的中文名稱 |
| `operand1Code` | 運算元一的代號——原始欄位代碼（見下方「原始欄位代碼對照」）或這張表裡另一個指標的 `code` |
| `operator` | 運算子（`+`/`-`/`*`/`/`） |
| `operand2Code` | 運算元二的代號，同上 |

## 2026-09-05：從 financialReportXbrl.csv 衍生了 32 個新指標（連同既有的 BV/ROE 共 34 個）

## 原始欄位代碼對照（`operand*Code` 不是 metricFormulas 自己 `code` 時，對應到這裡）

這些是 `financialReportXbrl.csv` 裡實際存在的欄位（`columnName`），這裡用簡短好記的代號
取代冗長的原始欄位名稱，方便寫公式：

| 代號 | 三表來源 | 對應 financialReportXbrl.csv 的 columnName |
|---|---|---|
| `revenue` | 損益表 | `revenue` |
| `grossProfit` | 損益表 | `gross_profit` |
| `operatingProfit` | 損益表 | `profit_loss_from_operating_activities` |
| `operatingExpense` | 損益表 | `operating_expense` |
| `operatingCost` | 損益表 | `operating_costs` |
| `preTaxEarning` | 損益表 | `profit_loss_before_tax` |
| `postTaxEarning` | 損益表 | `profit_loss`（**不是** `profit_loss_attributable_to_owners_of_parent`——後者是歸屬於母公司業主的部分，兩者不一樣，之後真的要接的時候要決定 ROE/ROA 這類比率用哪一個當分子，這裡先用整體數字，跟 BV/ROE 範例給的定義一致） |
| `incomeTaxExpense` | 損益表 | `income_tax_expense_continuing_operations` |
| `financeCosts` | 損益表 | `finance_costs` |
| `interestExpense` | 損益表 | `interest_expense`（少數公司這欄位是空的，見 `financialReportXbrl.md` 的已知限制） |
| `rdExpense` | 損益表 | `research_and_development_expense` |
| `asset` | 資產負債表 | `assets` |
| `currentAsset` | 資產負債表 | `current_assets` |
| `liability` | 資產負債表 | `liabilities` |
| `currentLiability` | 資產負債表 | `current_liabilities` |
| `equity` | 資產負債表 | `equity`（跟這裡算出來的 `BV` 理論上應該相等，`BV` 是刻意從資產減負債重新算一次，不是偷懶抄現成欄位——兩者對不起來的話代表資料有問題，可以互相驗證用） |
| `cash` | 資產負債表 | `cash_and_cash_equivalents` |
| `inventory` | 資產負債表 | `inventories` |
| `retainedEarnings` | 資產負債表 | `retained_earnings` |
| `shorttermBorrowing` | 資產負債表 | `shortterm_borrowings` |
| `longtermBorrowing` | 資產負債表 | `longterm_borrowings` |
| `accountsReceivable` | 資產負債表 | `accounts_receivable_net` |
| `noncontrollingInterest` | 資產負債表 | `noncontrolling_interests` |
| `ocf` | 現金流量表（累計數） | `cash_flows_from_used_in_operating_activities` |
| `capex` | 現金流量表（累計數） | `purchase_of_ppe_investing`（**注意符號**，見下方「符號慣例」） |
| `adjDepreciation` | 現金流量表（累計數） | `adj_depreciation_expense` |
| `adjAmortisation` | 現金流量表（累計數） | `adj_amortisation_expense` |
| `mgmtCompensation` | `key_management_compensation_xbrl`（不是三表） | `total_key_management_personnel_compensation_ytd` |

## 符號慣例（重要，不然算出來的方向會反）

`cumulative_cash_flow_statement_xbrl` 裡「流出」類的欄位（買不動產廠房設備、發股利、付利息⋯）
在資料庫裡本身就存成**負數**，不是正數金額（實測 1101 115Q2：`purchase_of_ppe_investing =
-13931211`）。所以 `FCF = ocf + capex` 用的是**加法**，不是教科書常見寫法的「OCF − CapEx」——
因為 `capex` 這裡已經是負值，加上去等於減掉那筆流出。之後真的要接的時候，如果原始資料的符號
慣例有變，這裡的運算子要跟著檢查，不能照抄教科書公式的減號。

## 這次沒有涵蓋的部分（40 張表裡，只有 3 張核心表 + 1 個欄位真正拿來算了公式）

`financialReportXbrl.csv` 涵蓋 40 張表，這次全部掃過一輪，能塞進「兩個運算元 + 一個運算子」
這種公式格式的，只有 `quarterly_income_statement_xbrl`/`quarterly_balance_sheet_xbrl`/
`cumulative_cash_flow_statement_xbrl` 這三張核心表（一家公司一季一列，欄位是純量），加上
`key_management_compensation_xbrl` 借用了一個欄位。其餘 36 張表沒有納入，原因分兩種：

1. **多列表，需要先做加總/篩選才能變成一個純量**（這種格式的公式表現在做不到）：
   `equity_change_xbrl`（每個權益組成項目`member`各一列）、`consolidated_entity_xbrl`、
   `mainland_china_investment_xbrl`、`intercompany_transaction_xbrl`、
   `loans_to_others_xbrl`、`endorsement_guarantee_xbrl`、
   `related_party_transaction_flow_xbrl`、`related_party_transaction_balance_xbrl`、
   `accounts_receivable_aging_xbrl`、`related_party_name_xbrl`、
   `mainland_china_investment_limit_xbrl`、`bank_npl_disposal_xbrl`、
   `non_performing_receivables_xbrl`、`exempted_from_reporting_xbrl`、
   `investee_company_xbrl`、`financial_ratio_restriction_xbrl`、
   `trade_and_other_receivables_xbrl`（這幾張都有 `line_order` 欄位，代表一家公司一季有
   多列）。這批表裡其實藏著不少有意義的投資指標（例如關係人交易佔營收比、背書保證對淨值比、
   應收帳款帳齡集中度），但要先解決「怎麼把多列聚合成單一數字」的問題，不是這次的範圍。
2. **銀行/保險/證券商專屬明細表，欄位量大且多數是雜湊後綴的欄位名（例如
   `fair_value_of_investments_in_equity_instruments__9c69ab`），需要對照原始 XBRL taxonomy
   才能正確解讀**：`bank_*`（6 張）、`insurance_*`（3 張）、`securities_*`（3 張）、
   `financial_holding_*`（3 張）、`group_capital_adequacy_detail_xbrl`、
   `eligible_capital_composition_xbrl`、`audit_scope_xbrl`。這批表裡不少關鍵比率
   （銀行逾放比、資本適足率）其實**已經是現成算好的欄位**（例如
   `bank_asset_quality_xbrl.non_performing_loans_ratio`、
   `bank_capital_adequacy_detail_xbrl.ratio_ordinary_share_equity_to_rwa`），不需要
   另外用公式衍生，只是這次沒有逐一盤點清楚哪些是「現成欄位」、哪些是「需要衍生」。
   之後真的要做某個產業的指標，建議針對那個產業另外開一輪盤點，不要跟這次的通用指標混在
   一起做。
