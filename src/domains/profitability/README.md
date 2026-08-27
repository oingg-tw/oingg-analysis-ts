# 獲利能力與資本配置效率（profitability_and_capital_allocation）

- **scope**：Security
- **說明**：衡量本業獲利轉化能力、資本配置報酬率以及股東回報政策。

## 指標清單

| code | 中文名稱 | 公式 | supported_periods | 狀態 |
|---|---|---|---|---|
| `EPS` | 每股盈餘 | `(Net Income - Preferred Dividends) / Weighted Average Common Shares` | MRQ, TTM, FY, Diluted | ✅ 已實作 — [`eps/`](eps/)，`GET /profitability/eps`（單季/年化/TTM） |
| `Gross_Margin` | 毛利率 | `(Revenue - COGS) / Revenue` | MRQ, TTM, FY | ✅ 已實作 — [`margins/`](margins/)，`GET /profitability/margins`（單季/TTM，沒有年化版本，見下方說明） |
| `Operating_Margin` | 營業利益率 | `Operating Income / Revenue` | MRQ, TTM, FY | ✅ 已實作 — [`margins/`](margins/)，`GET /profitability/margins`（單季/TTM） |
| `Net_Profit_Margin` | 稅後淨利率 | `Net Income / Revenue` | MRQ, TTM, FY | ✅ 已實作 — [`margins/`](margins/)，`GET /profitability/margins`（單季/TTM） |
| `ROE` | 股東權益報酬率 | `Net Income / Shareholders' Equity` | MRQ_Annualized, TTM, FY | ✅ 已實作 — [`roe/`](roe/)，`GET /profitability/roe`（單季/年化/TTM） |
| `ROA` | 總資產報酬率 | `Net Income / Total Assets` | MRQ_Annualized, TTM, FY | ✅ 已實作 — [`roa/`](roa/)，`GET /profitability/roa`（單季/年化/TTM） |
| `ROIC` | 投入資本回報率 | `NOPAT / Invested Capital` | TTM, FY | ✅ 已實作 — [`roic/`](roic/)，`GET /profitability/roic`（單季/年化/TTM）。見下方「ROIC/ROCE 計算口徑」 |
| `ROCE` | 使用資本報酬率 | `EBIT / (Total Assets - Current Liabilities)` | TTM, FY | ✅ 已實作 — [`roce/`](roce/)，`GET /profitability/roce`（單季/年化/TTM） |
| `CFROI` | 現金流投資回報率 | `Gross Cash Flow / Gross Invested Capital` | TTM, FY | ⬜ 未實作——taxonomy 定義本身模糊（通常需要通膨調整的重置成本會計），優先度較低 |
| `Dividend_Payout_Ratio` | 配息率 | `Total Dividends / Net Income` | TTM, FY | ✅ 已實作 — [`dividendPayoutRatio/`](dividendPayoutRatio/)，`GET /profitability/dividend-payout-ratio`（只有 TTM，見下方說明） |
| `SGR` | 可持續成長率 | `ROE * (1 - Dividend Payout Ratio)` | TTM, FY | ✅ 已實作 — [`sgr/`](sgr/)，`GET /profitability/sgr`（只有 TTM，複合指標直接引用 `roe`/`dividendPayoutRatio`） |

## 本服務自行歸類的指標（不在 taxonomy 明列的 code 裡）

跟 EPS 同屬「每股基礎財務數字」家族，taxonomy 沒有獨立列出，但性質、計算模式（單季/年化/TTM、查 `capital_stock_history` 抓流通股數）都跟 EPS 一致，所以放在這一類：

| 指標 | 公式 | 狀態 |
|---|---|---|
| BVPS（每股淨值） | `Shareholders' Equity / Paid-in Shares` | ✅ 已實作 — [`bvps/`](bvps/)，`GET /profitability/bvps` |
| 每股營收 | `Revenue / Paid-in Shares` | ✅ 已實作 — [`revenuePerShare/`](revenuePerShare/)，`GET /profitability/revenue-per-share`（單季/年化/TTM） |
| 杜邦分析法（DuPont Analysis） | `ROE = Net Profit Margin x Asset Turnover x Equity Multiplier` | ✅ 已實作 — [`dupont/`](dupont/)，`GET /profitability/dupont`（單季/TTM）。**不是大師指標**：杜邦公司（企業）發展出來的標準拆解技巧，不是特定投資人/學者的主觀複合公式，所以放在這裡不是 `guru`。見下方「杜邦分析法計算口徑」 |

## 實作慣例（給之後要做剩餘指標的人）

- 淨利欄位優先採用「歸屬於母公司」口徑（`netIncomeAttributableToParent`），缺漏時退回整體數字（`netIncome`）——見 [`roe/service.ts`](roe/service.ts) 的 `pickNetIncome`。`Gross_Margin`/`Operating_Margin` 的分子（毛利、營業利益）是損益表單一欄位，沒有母子公司口徑選擇問題；`Net_Profit_Margin` 的分子是淨利，套用同一套 `pickNetIncome` 選擇邏輯，見 [`margins/service.ts`](margins/service.ts)。
- 需要流通股數的指標一律查 `capital_stock_history`（見 [`../../shared/capitalStock.ts`](../../shared/capitalStock.ts) 的 `getPaidInSharesAsOf`），不要用「股本 ÷ 10」估算；財報金額單位是千元，股數是實際股數，換算時記得 x1000（BVPS 曾經漏過這步，見 [`bvps/service.ts`](bvps/service.ts) 註解）。
- 單季/年化/TTM 三個口徑放同一張表、同一支 API，不要拆開（EPS 曾經先拆過 `eps-ttm` 獨立一支，後來合併回來）。
- **不是每個指標都需要「年化」欄位**：`Gross_Margin`/`Operating_Margin`/`Net_Profit_Margin` 是「同期流量 / 同期流量」的比率（例如本季毛利 / 本季營收），比率本身已經跟期間長度無關，不需要像 ROE（流量對存量）那樣簡單 x4 年化——[`margins/`](margins/) 只有 `*Quarterly` 跟 `*Ttm` 兩種口徑，沒有 `*QuarterlyAnnualized`，之後遇到其他「流量/流量」型比率也適用同樣判斷。

## ROIC/ROCE 計算口徑

- **EBIT** 算法跟 [`../solvency/interestCoverage/`](../solvency/interestCoverage/)/[`../solvency/netDebtToEbitda/`](../solvency/netDebtToEbitda/) 完全一致：稅前淨利（`profitBeforeTax`） + 利息費用（`financeCosts`），財報沒有現成 EBIT 欄位，用這個方式反推。
- **ROCE** 分母（使用資本 Capital Employed） = 總資產 - 流動負債，期末餘額，跟 ROE 用期末權益同一種刻意簡化。
- **ROIC** 分子是 NOPAT（稅後淨營業利潤） = EBIT x (1 - 有效稅率)，有效稅率 = 所得稅費用 / 稅前淨利——**稅前淨利為零或負數時無法計算**（有效稅率沒有意義），該季 ROIC 會是 `null`。
- **ROIC** 分母（投入資本 Invested Capital） = 有息負債（短期借款+應付公司債+長期借款，口徑跟 [`../solvency/deRatio/`](../solvency/deRatio/) 一致） + 權益 - 現金及約當現金，扣現金是常見做法，排除非用於營運的超額現金部位。
- 兩者都跟 ROE/ROA 同一種單季/年化/TTM 三數值結構（單季簡單 x4 年化；TTM 是近四季分子加總 / 本季期末分母）。

## 配息率／SGR 計算口徑

- **配息率只提供 TTM 口徑**：現金股利通常一年只發放一到兩次，不是每季平均發放，單季配息率會因為「剛好有沒有發股利的那一季」劇烈失真，近四季加總才是有意義的年度口徑。
- payoutRatioTtm = `|近四季現金股利發放（quarterly_cash_flow_statement.dividendsPaid）加總| / 近四季淨利加總 * 100`。`dividendsPaid` 某季缺值視為 0（該季沒有發放，不是資料缺漏），跟 `deRatio`/`netDebtToEbitda` 的有息負債欄位處理邏輯一致；只有淨利缺漏才會讓 TTM 視為不齊。近四季淨利加總為零或負數時無法計算。
- **SGR 是本服務第二個複合指標**：[`sgr/service.ts`](sgr/service.ts) 直接引用 `roe`/`dividendPayoutRatio` 已經算好的 TTM 數值，不重複查詢，跟 `guru/grahamNumber` 引用 `eps`/`bvps` 同一種模式。因為配息率只有 TTM 口徑，SGR 自然也只有 TTM。

## 杜邦分析法計算口徑

- **3 步版**（不是拆到稅負擔/利息負擔的 5 步版）：`ROE = 淨利率 x 總資產週轉率 x 權益乘數`。
- **本服務第三個複合指標**：[`dupont/service.ts`](dupont/service.ts) 直接引用 `margins`/`turnoverRatio`/`roe` 三支服務已經算好的數值，不重複查詢損益表/資產負債表，跟 `sgr` 引用 `roe`/`dividendPayoutRatio` 同一種模式。副作用是呼叫 `GET /profitability/dupont` 時，`margins`/`turnoverRatio`/`roe` 三支服務也會各自照常把自己的結果 upsert 進對應的表，這是預期行為。
- **權益乘數** = 總資產 / 權益，純資產負債表時點快照，單季/TTM 共用同一個值——跟 ROE 用期末權益、不分單季/TTM 是同一個道理。
- **不是大師指標**：跟 Altman Z-Score、Beneish M-Score 不同，杜邦分析法不是某個投資人/學者提出、帶有主觀判斷的複合公式，是杜邦公司（企業，不是個人）在 1920 年代發展出來的標準財務拆解技巧，不符合 [`../guru/README.md`](../guru/README.md) 的分類規則（掛名特定研究者/投資人），所以歸類在這裡。
- **交叉驗證設計**：回傳的 `decomposedRoeQuarterlyPct`/`decomposedRoeTtmPct` 是用三個因子重新相乘組裝出來的 ROE，理論上應該接近 `roe/` 直接算出來、原樣回傳的 `actualRoeQuarterlyPct`/`actualRoeTtmPct`。實測 2330 115Q2：分解版單季 11.37% vs 實際單季 10.98%、分解版 TTM 34.57% vs 實際 TTM 34.78%——兩者不完全相等，差異來自中間值（尤其 `assetTurnoverQuarterly` 只取到小數點後 2 位，單季週轉率數值本身較小時，四捨五入的相對誤差會被放大）四捨五入造成的正常誤差，不是計算邏輯錯誤；小差距本身也順便驗證了杜邦拆解跟 ROE 計算邏輯彼此一致。
