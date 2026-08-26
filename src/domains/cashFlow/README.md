# 現金流品質與法證會計防雷（cash_flow_and_earnings_quality）

- **scope**：Security
- **說明**：衡量會計帳面獲利與真實現金流的匹配度，排查應計項目與潛在盈餘操縱。

## 指標清單

| code | 中文名稱 | 公式 | supported_periods | 狀態 |
|---|---|---|---|---|
| `FCF` | 自由現金流 | `Operating Cash Flow - Capital Expenditures` | TTM, FY, MRQ | ✅ 已實作（每股版本） — [`cashFlowPerShare/`](cashFlowPerShare/)，`GET /cash-flow/cash-flow-per-share`（單季/年化/TTM）。本服務算的是「每股 FCF」，不是 taxonomy 寫的公司總額，見下方說明 |
| `FCF_Yield` | 自由現金流殖利率 | `Free Cash Flow Per Share / Stock Price` | TTM, FY | ⬜ 未實作，需要股價，屬於 [`../valuation/`](../valuation/README.md) 那條資料源缺口 |
| `OCF_to_Net_Income` | 營運現金流對淨利比 | `Operating Cash Flow / Net Income` | TTM, FY | ✅ 已實作 — [`ocfToNetIncome/`](ocfToNetIncome/)，`GET /cash-flow/ocf-to-net-income`（單季/TTM，沒有年化，見下方說明） |
| `Accruals_Ratio` | 應計項目比率 | `(Net Income - OCF - ICF) / Average Total Assets` | TTM, FY | ✅ 已實作 — [`accrualsRatio/`](accrualsRatio/)，`GET /cash-flow/accruals-ratio`（單季/年化/TTM）。分母用期末總資產，不是平均值，見下方說明 |

`Beneish_M_Score`（貝尼許 M 分數）2026-08-25 改歸類到 [`../guru/`](../guru/README.md)（大師策略）——公式本身是 8 變量加權會計異常指數，跟 `Altman_Z_Score` 從 `solvency` 移過去是同一個判斷標準（以學者/研究者命名的複合模型，不是單純的財報比率），不算在這一類。這個分類拿掉 `Beneish_M_Score` 之後只剩 `FCF_Yield` 未實作（見上方，需要股價）。

## 已實作但跟 taxonomy 定義範疇不同的地方

taxonomy 的 `FCF` 是公司層級的總額（Operating Cash Flow - CapEx，單位是總金額），本服務目前做的是 [`cashFlowPerShare/`](cashFlowPerShare/) 這個**每股**版本（OCF 每股、FCF 每股），因為當初是接續 EPS/BVPS/每股營收那條「每股基礎指標」的脈絡做的，放進了 `profitability` 的姊妹脈絡但實際歸類在這裡（因為 FCF 本身在 taxonomy 是歸在 cash_flow_and_earnings_quality）。公司總額版本的 OCF/FCF（不除以股數）目前沒有獨立公開，但 API 回應裡的 `operatingCashFlow.value`、`capitalExpenditures.value` 就是總額（千元），要重建總額版本不需要新查詢，直接讀這兩個欄位即可。

`Accruals_Ratio` 分母用 `Accruals_Ratio` taxonomy 原文的「平均總資產」改成**本季期末總資產**——跟 [`../turnover/turnoverRatio/`](../turnover/turnoverRatio/) 用期末餘額同一種刻意簡化（避免多查一期資產負債表）。

## 實作慣例

- `capitalExpenditures` 在資料庫裡本身是負數（現金流出），FCF = OCF **+** capex，不是減——這是計算這類指標時最容易踩的坑，見 [`cashFlowPerShare/service.ts`](cashFlowPerShare/service.ts) 註解。
- OCF、FCF 共用同一支 API/同一張表，也共用同一組 TTM 完整性判斷（一季只要 OCF 或資本支出任一為 `null`，該季就整個視為不齊）。
- `OCF_to_Net_Income` 是「流量/流量」比率（OCF / 淨利），結構跟 `../profitability/margins/` 一樣：只有單季跟 TTM 兩種口徑，沒有年化。比率明顯低於 1（尤其是負值）代表帳面淨利缺乏真實現金流量支撐，常跟 `Accruals_Ratio` 一起判讀盈餘品質。
- `Accruals_Ratio` 需要用到 `netCashFromInvestingActivities`（ICF，投資活動現金流）——這個欄位資料庫裡一直都有，但在這之前沒有任何 service 用過。
