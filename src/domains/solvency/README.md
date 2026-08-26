# 財務結構、償債安全與破產預警（solvency_and_financial_health）

- **scope**：Security
- **說明**：檢視槓桿水平、短期流動性安全墊以及極端情境下的抗風險破產預警能力。

## 指標清單

| code | 中文名稱 | 公式 | supported_periods | 狀態 |
|---|---|---|---|---|
| `Current_Ratio` | 流動比率 | `Current Assets / Current Liabilities` | MRQ, FY | ✅ 已實作 — [`liquidityRatio/`](liquidityRatio/)，`GET /solvency/liquidity-ratio` |
| `Quick_Ratio` | 速動比率 | `(Cash + Marketable Securities + Receivables) / Current Liabilities` | MRQ, FY | ✅ 已實作 — [`liquidityRatio/`](liquidityRatio/)，`GET /solvency/liquidity-ratio`。公式略有差異，見下方說明 |
| `Cash_Ratio` | 現金比率 | `(Cash + Cash Equivalents) / Current Liabilities` | MRQ, FY | ✅ 已實作 — [`liquidityRatio/`](liquidityRatio/)，`GET /solvency/liquidity-ratio` |
| `DE_Ratio` | 負債權益比 | `Total Debt / Shareholders' Equity` | MRQ, FY | ✅ 已實作 — [`deRatio/`](deRatio/)，`GET /solvency/de-ratio`。`Total Debt` 用的是有息負債（短期借款+應付公司債+長期借款），不是總負債 |
| `Debt_to_Assets` | 資產負債率 | `Total Liabilities / Total Assets` | MRQ, FY | ✅ 已實作 — [`debtRatio/`](debtRatio/)，`GET /solvency/debt-ratio` |
| `Net_Debt_to_EBITDA` | 淨負債對 EBITDA 比 | `(Total Debt - Cash) / EBITDA` | TTM, FY | ✅ 已實作 — [`netDebtToEbitda/`](netDebtToEbitda/)，`GET /solvency/net-debt-to-ebitda`（簡單年化/TTM，沒有原始單季版本，見下方說明） |
| `Interest_Coverage` | 利息保障倍數 | `EBIT / Interest Expense` | TTM, FY | ✅ 已實作 — [`interestCoverage/`](interestCoverage/)，`GET /solvency/interest-coverage`（單季/TTM，見下方說明） |

`Altman_Z_Score`（奧特曼 Z 分數）2026-08-24 改歸類到 [`../guru/`](../guru/README.md)（大師策略），不算在這一類——雖然公式本身是加權財務比率、性質很像本分類，但跟其他「大師以自己名字提出的複合公式」放在一起比較合理。這個分類目前**全部指標都已實作**（`Current_Ratio`/`Quick_Ratio`/`Cash_Ratio`/`DE_Ratio`/`Debt_to_Assets`/`Net_Debt_to_EBITDA`/`Interest_Coverage`）。

## 已實作但跟 taxonomy 公式略有差異的地方

`Quick_Ratio`（速動比率）taxonomy 的公式是 `(現金 + 有價證券 + 應收帳款) / 流動負債`，本服務用的是更常見的簡化版本 `(流動資產 - 存貨) / 流動負債`（兩者理論上該相等，前提是流動資產只由現金、有價證券、應收帳款、存貨組成；實務上流動資產可能還有預付款項等其他項目，兩個公式數字會有些微差異）。如果要跟 taxonomy 完全對齊，需要改抓 `cashAndEquivalents` + 有價證券欄位（目前 schema 沒有單獨的「有價證券」欄位）+ `accountsReceivable`。

## 實作慣例

- `Current_Ratio`/`Quick_Ratio`/`Cash_Ratio` 共用同一支 API/同一張表（[`liquidityRatio/`](liquidityRatio/)）——三個分母都是流動負債，一定要先有流動資產/流動負債，拆開只會重複查詢。
- 這一類的指標多數是**純資產負債表時點快照**（`Debt_to_Assets`、`Current_Ratio`、`Quick_Ratio`、`Cash_Ratio`、`DE_Ratio`），不像 ROE/ROA 有單季/年化/TTM 的區別——資產負債表本身就是某一天的餘額，annualize 對這種比率沒有意義，只有單一數值。
- `Interest_Coverage` 是「流量/流量」比率（EBIT / 利息費用，兩者都是損益表當季數字），結構跟 [`../profitability/margins/`](../profitability/margins/) 一樣：只有單季跟 TTM 兩種口徑，沒有年化。
- `DE_Ratio`、`Net_Debt_to_EBITDA` 的分子刻意只算**有息負債**（`shortTermBorrowings` + `bondsPayable` + `longTermBorrowings`），不是 `Debt_to_Assets` 用的總負債——兩個指標分子不一樣，即使都叫「負債」；三個欄位任一為 `null` 視為 0（沒有借那種負債），不是資料缺漏，只有整張資產負債表查無資料才算缺漏。
- `Interest_Coverage`、`Net_Debt_to_EBITDA` 的 EBIT 都用「稅前淨利 + 利息費用」反推，不是直接抓某個 EBIT 欄位（財報沒有現成的 EBIT 欄位）；EBITDA 再加回折舊、攤銷（來自現金流量表的間接法加回項目，見 [`netDebtToEbitda/`](netDebtToEbitda/)）。
- **`Net_Debt_to_EBITDA` 是第一個要同時查三張財報表的指標**：資產負債表算淨負債（存量），損益表+現金流量表算 EBITDA（流量）。因為是「存量對一年份流量」的比率，taxonomy 只支援 TTM/FY，不支援單季——只提供簡單年化（單季 EBITDA x4）跟 TTM（近四季實際加總）兩種口徑，沒有原始單季版本。
