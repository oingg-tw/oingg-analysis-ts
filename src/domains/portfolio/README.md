# 投資組合風險、超額報酬與量化因子（portfolio_risk_and_factors）

- **scope**：Portfolio（`Beta` 例外，見下方）
- **說明**：衡量資產配置的波動度、基準偏離、下行風險與承擔風險所換取的超額報酬。
- **狀態**：部分實作（`Beta`，2026-08-26，是這一類目前唯一做的）。

## 為什麼整類（除了 Beta）都還沒做

這是唯一 `scope` 不是 `Security` 的分類——這裡多數指標評估的是「一個投資組合（多檔標的的配置）」，不是單一公司。本服務目前的資料模型（`companyId` + `year` + `season`）只支援查詢單一公司單一季度，完全沒有「使用者持有哪些部位、權重多少」這種投資組合層級的資料結構。要做這一類，得先設計一套全新的組合資料模型（可能需要使用者自訂持股清單、權重、基準指數），跟現有「查某公司某季財報比率」是完全不同的產品形態，屬於架構層級的決定，不是加一個指標而已。

多數指標還需要**歷史報酬率序列**（每日/月報酬），這又回到跟 [`../technicals/`](../technicals/README.md) 一樣缺市場價格時間序列的問題。

**`Beta` 是這一類的例外**：雖然 taxonomy 把它跟其他投資組合指標放在同一類，但公式本身只需要「單一標的的日報酬率」跟「市場基準指數的日報酬率」，不需要使用者自訂的投資組合持股結構——本質上是 `scope: Security` 的指標，只是剛好被 taxonomy 歸進這個資料夾。2026-08-26 發現 oingg-mops-ts 有 `daily_market_index`（加權股價指數，646 個交易日，2021-09 至今）跟 `daily_stock_price`（個股日成交，**目前只有 2330 台積電一檔股票**）這兩張表，之前完全沒鏡像過，補上之後這個指標的資料就齊了。其他指標（`Alpha`、`Sharpe_Ratio`⋯⋯）真正需要的「投資組合資料模型」問題還是沒解決，不要因為 Beta 做出來了就以為整類都解套了。

## 指標清單

| code | 中文名稱 | 公式 | supported_periods | 說明 |
|---|---|---|---|---|
| `Alpha` | 阿爾法 | `Portfolio Return - (Risk Free Rate + Beta * (Market Return - Risk Free Rate))` | 1Y, 3Y, 5Y | 超越 CAPM 理論預期收益的純主動管理超額報酬 |
| `Beta` | 貝塔係數 | `Covariance(Asset, Benchmark) / Variance(Benchmark)` | 6M_Daily, 1Y_Daily, 3Y_Monthly, 5Y_Monthly | ✅ 已實作 — [`beta/`](beta/)，`GET /portfolio/beta`（本服務用 1Y/2Y/5Y 三個窗口，跟 taxonomy 列的口徑不完全一樣，見下方說明） |
| `Annualized_Volatility` | 年化波動度 | `Standard Deviation of Returns * sqrt(252)` | 30D, 90D, 252D, 3Y | 報酬率分佈的離散標準差，衡量資產價格的波動不確定性 |
| `Sharpe_Ratio` | 夏普值 | `(Portfolio Return - Risk Free Rate) / Annualized Volatility` | 1Y, 3Y, 5Y | 衡量投資組合每承擔一單位總風險所換取的超額報酬 |
| `Sortino_Ratio` | 索提諾指標 | `(Portfolio Return - Risk Free Rate) / Downside Deviation` | 1Y, 3Y, 5Y | 僅以負報酬下行標準差為分母，專注衡量承擔虧損風險之超額效益 |
| `MDD` | 最大回撤 | `(Trough Value - Peak Value) / Peak Value` | 1Y, 3Y, 5Y, Max_History | 回溯期間內資產淨值從最高峰回落至最低谷的最大累計跌幅 |
| `Calmar_Ratio` | 卡瑪比率 | `Annualized Return / |Maximum Drawdown|` | 3Y, 5Y | 年化報酬率與歷史最大回撤之比，衡量回撤承受度下的收益能力 |
| `Tracking_Error` | 追蹤誤差 | `Standard Deviation of (Portfolio Return - Benchmark Return)` | 1Y, 3Y | 投資組合收益偏離被動基準指數的主動風險大小 |
| `Information_Ratio` | 資訊比率 | `Active Return / Tracking Error` | 1Y, 3Y | 每承受一單位主動追蹤風險所獲取的主動超額報酬 |
| `VaR` | 在險價值 | 特定信賴水準下最大預期損失 | 1D_95%, 1D_99%, 10D_99% | 特定信賴水準與期間內，組合可能發生的最大潛在損失 |
| `CVaR` | 條件在險價值 / 預期損失 | 損失超過 VaR 門檻時的條件期望損失 | 1D_95%, 1D_99% | 極端尾端事件突破 VaR 門檻時，預期平均損失的嚴重程度 |

## Beta 計算口徑

- **公式**：Beta = `Cov(個股報酬率, 加權股價指數報酬率) / Var(加權股價指數報酬率)`，樣本共變異數/變異數（分母 n-1）。
- **三個窗口取樣頻率不同，不是全部用日資料**：1Y 用日資料（≈252 個取樣點）、2Y 用週資料（≈104 個取樣點，對齊 Bloomberg 常見預設）、5Y 用月資料（≈60 個取樣點，對齊 Yahoo Finance 常見標準）——2026-08-26 一開始上線時三個窗口都用日資料（v1 簡化），後來使用者拿業界常見取樣頻率對照表回頭要求修正：長窗口用日資料會把雜訊、非同步交易造成的短期波動也算進「長期結構性風險」裡，不是業界慣例，taxonomy 原文（`6M_Daily/1Y_Daily/3Y_Monthly/5Y_Monthly`）其實也是長窗口用月資料，不是本服務憑空要求的。
- **降頻規則**：先按窗口日期範圍（`asOfDate` 往前 N 個日曆年）篩出重疊交易日，再依取樣頻率分桶——週資料用 ISO 8601 週（週一為一週開始）分桶，月資料用西元年月分桶，**每個週期取「最後一個重疊交易日」當代表點**（不是平均、不是隨便挑），最後用降頻後相鄰兩個代表點算報酬率。
- **只用「股價與指數都有資料」的重疊交易日序列**：報酬率 = `(本期收盤 − 前一期收盤) / 前一期收盤`，前一期是指降頻後序列裡的前一筆，不是各自序列自己的前一筆——如果股價或指數任一邊某天缺資料，那天直接不在重疊序列裡，不會用不對齊的日期去配對算報酬率。
- **基準日（`asOfDate`）= 股價與指數都有資料的最新一個重疊交易日**，或選填指定日期時，往前找最近的重疊交易日；跟 [`../valuation/marketRatios/`](../valuation/marketRatios/) 同一種「跟財務季度脫鉤、選填日期」的查詢介面。
- **降頻後取樣點數少於 20 個（19 個報酬率樣本）視為樣本數不足，不計算**——這個門檻是本服務自訂的簡單防呆，不是 taxonomy 定義的，三個窗口共用同一個門檻數字（不分頻率調整）；5 年窗口容易因為兩個資料源更新進度不同步（例如指數資料落後股價資料幾個月）而重疊區間比理論上的 5 年短。
- **只有 2330（台積電）能算**：`daily_stock_price` 目前只鏡像了台積電一檔股票，查其他公司的 `companyId` 會在 `fieldStatuses` 標成 `not_applicable`（見下方「null 值規範」），不是伺服器錯誤。
- 已用台積電（2330）實測：截至 2026-08-26，Beta（1Y，日資料）≈ 1.09、Beta（2Y，週資料）、Beta（5Y，月資料）——數值會隨每天新增的股價/指數資料變動，不是固定值，之後重新驗證看到的數字不一樣是正常的，回應裡的 `samplingFrequency`/`observations` 可以確認實際用的是哪種頻率、幾個取樣點。

## null 值規範（2026-08-26 起新指標的統一慣例）

`beta/` 是第一個採用新規範的指標——除了既有的 `warnings: string[]`（人類可讀的完整說明，繼續保留），回應多了一個 `fieldStatuses` 欄位，把每個值為 `null` 的欄位標成三種原因之一：

- `no_data`：資料庫查無必要的原始資料（例如兩個資料源完全沒有重疊交易日）。
- `not_applicable`：這個指標對查詢對象結構性不適用（例如 `daily_stock_price` 沒有這檔股票的資料，不是「還沒補齊」而是「目前完全沒有覆蓋」）。
- `calculation_error`：資料都有，但套公式算不出有意義的值（例如重疊交易日數低於最低樣本數門檻）。

詳細型別定義見 [`../../shared/metricStatus.ts`](../../shared/metricStatus.ts)。**這個規範目前只有 `beta/` 在用，其他 21 支既有指標還沒有回頭套用**——那是另一次規模更大的遷移，還沒排定時間，回頭改其他指標之前記得跟使用者確認範圍。
