# 營運週轉與資產效率（operating_efficiency_and_turnover）

- **scope**：Security
- **說明**：衡量營運資本在供應鏈及業務循環中轉換為現金的速度與效能。

## 指標清單

| code | 中文名稱 | 公式 | supported_periods | 狀態 |
|---|---|---|---|---|
| `CCC` | 現金轉換週期 | `DIO + DSO - DPO` | TTM, FY | ✅ 已實作 — 併入 [`turnoverRatio/`](turnoverRatio/)，`GET /turnover/turnover-ratio`（只有年化/TTM，見下方說明） |
| `DIO` | 存貨週轉天數 | `(Average Inventory / COGS) * 365` | TTM, FY | ✅ 已實作 — 併入 [`turnoverRatio/`](turnoverRatio/)，`GET /turnover/turnover-ratio`。= `365 / 存貨周轉率（年化）`，沿用已有的存貨周轉率換算，不需要新查詢 |
| `DSO` | 應收帳款週轉天數 | `(Average Accounts Receivable / Credit Sales) * 365` | TTM, FY | ✅ 已實作 — 併入 [`turnoverRatio/`](turnoverRatio/)，`GET /turnover/turnover-ratio`。= `365 / 應收帳款周轉率（年化）` |
| `DPO` | 應付帳款週轉天數 | `(Average Accounts Payable / COGS) * 365` | TTM, FY | ✅ 已實作 — 併入 [`turnoverRatio/`](turnoverRatio/)，`GET /turnover/turnover-ratio`。新增應付帳款周轉率（`accountsPayable` 欄位一直都有，先前沒有 service 用過），= `365 / 應付帳款周轉率（年化）` |
| `Asset_Turnover` | 總資產週轉率 | `Revenue / Average Total Assets` | TTM, FY | ✅ 已實作 — [`turnoverRatio/`](turnoverRatio/)，`GET /turnover/turnover-ratio`（單季/年化/TTM）。taxonomy 用平均總資產，本服務用期末總資產，見下方說明 |
| `Fixed_Asset_Turnover` | 固定資產週轉率 | `Revenue / Net Fixed Assets` | TTM, FY | ✅ 已實作 — 併入 [`turnoverRatio/`](turnoverRatio/)，`GET /turnover/turnover-ratio`（單季/年化/TTM）。分母用 `propertyPlantEquipment`（不動產、廠房及設備），一樣是期末餘額 |
| `CapEx_to_Revenue` | 資本支出佔營收比 | `Capital Expenditures / Revenue` | TTM, FY | ✅ 已實作 — [`capexToRevenue/`](capexToRevenue/)，`GET /turnover/capex-to-revenue`（單季/TTM，沒有年化，見下方說明） |

## 已實作但跟 taxonomy 公式略有差異的地方

`turnoverRatio/` 目前一次算三個周轉率（存貨、應收帳款、總資產），都用「次」為單位、分母用**期末餘額**（不是 taxonomy 寫的期初期末平均），這是跟 ROE 用期末權益一樣的刻意簡化（v1 優先求簡單可驗證）。如果之後要跟 taxonomy 完全對齊：

- 分母要改用平均值，需要多查一期（上一季或去年同季）的資產負債表。
- 存貨、應收帳款、應付帳款周轉率如果要轉成 taxonomy 的 `DIO`/`DSO`/`DPO`（天數），直接拿現有的「次」數字做 `365 / 周轉次數` 換算即可，不需要重新查資料——這就是 `DIO`/`DSO`/`DPO`/`CCC` 現在的實作方式。

## DIO/DSO/DPO/CCC 計算口徑

- `DIO`/`DSO`/`DPO`（週轉天數） = `365 / 年化周轉率`，**只提供 `*QuarterlyAnnualized`/`*Ttm` 兩種口徑，沒有單季未年化版本**——`365 / 單季周轉次數`算出來是「一季裡的天數」，不是有意義的「週轉天數」，這個概念本來就是以一年為基準。
- `CCC` 現金轉換週期 = `DIO + DSO - DPO`，同樣只有年化跟 TTM 兩種口徑。
- 新增了應付帳款周轉率（`payablesTurnoverQuarterly/QuarterlyAnnualized/Ttm`） = 本季營業成本 / 本季期末應付帳款，跟其他三個周轉率同一種結構、同一張表，`accountsPayable` 這個欄位資料庫裡一直都有，只是先前沒有 service 用過。TTM 分子（近四季營業成本加總）直接沿用存貨周轉率 TTM 已經算好的加總值，不重複查詢。

## 實作慣例

- 存貨周轉率、應收帳款周轉率、總資產周轉率、固定資產周轉率、應付帳款周轉率共用同一支 API/同一張表（[`turnoverRatio/`](turnoverRatio/)）——五個都要查同一張損益表+資產負債表，也共用同一組 TTM 完整性判斷（一季只要營業成本或營收任一為 `null`，該季就整個視為不齊），拆開只會重複查詢。
- `CapEx_to_Revenue` 沒有併進 `turnoverRatio/`，另開 [`capexToRevenue/`](capexToRevenue/)——因為它是「流量/流量」比率（資本支出 / 營收，兩者都是當季數字），結構跟 `turnoverRatio/` 的「流量/存量」（營收 / 期末餘額）不同：只有單季跟 TTM 兩種口徑，沒有年化，反而跟 [`margins/`](margins/) 同一種結構。
- `CapEx_to_Revenue` 要注意單位陷阱：資料庫裡 `capitalExpenditures` 本身是負數（現金流出），算比率時要取絕對值——不然算出來的比率會是負的，跟慣例不符。
