# 投資組合風險、超額報酬與量化因子（portfolio_risk_and_factors）

- **scope**：Portfolio
- **說明**：衡量資產配置的波動度、基準偏離、下行風險與承擔風險所換取的超額報酬。
- **狀態**：⬜ 全部未實作。

## 為什麼整類都還沒做

這是唯一 `scope` 不是 `Security` 的分類——這裡的指標評估的是「一個投資組合（多檔標的的配置）」，不是單一公司。本服務目前的資料模型（`companyId` + `year` + `season`）只支援查詢單一公司單一季度，完全沒有「使用者持有哪些部位、權重多少」這種投資組合層級的資料結構。要做這一類，得先設計一套全新的組合資料模型（可能需要使用者自訂持股清單、權重、基準指數），跟現有「查某公司某季財報比率」是完全不同的產品形態，屬於架構層級的決定，不是加一個指標而已。

多數指標還需要**歷史報酬率序列**（每日/月報酬），這又回到跟 [`../technicals/`](../technicals/README.md) 一樣缺市場價格時間序列的問題。

## 指標清單

| code | 中文名稱 | 公式 | supported_periods | 說明 |
|---|---|---|---|---|
| `Alpha` | 阿爾法 | `Portfolio Return - (Risk Free Rate + Beta * (Market Return - Risk Free Rate))` | 1Y, 3Y, 5Y | 超越 CAPM 理論預期收益的純主動管理超額報酬 |
| `Beta` | 貝塔係數 | `Covariance(Asset, Benchmark) / Variance(Benchmark)` | 6M_Daily, 1Y_Daily, 3Y_Monthly, 5Y_Monthly | 衡量標的價格相對於基準市場系統性波動的敏感度 |
| `Annualized_Volatility` | 年化波動度 | `Standard Deviation of Returns * sqrt(252)` | 30D, 90D, 252D, 3Y | 報酬率分佈的離散標準差，衡量資產價格的波動不確定性 |
| `Sharpe_Ratio` | 夏普值 | `(Portfolio Return - Risk Free Rate) / Annualized Volatility` | 1Y, 3Y, 5Y | 衡量投資組合每承擔一單位總風險所換取的超額報酬 |
| `Sortino_Ratio` | 索提諾指標 | `(Portfolio Return - Risk Free Rate) / Downside Deviation` | 1Y, 3Y, 5Y | 僅以負報酬下行標準差為分母，專注衡量承擔虧損風險之超額效益 |
| `MDD` | 最大回撤 | `(Trough Value - Peak Value) / Peak Value` | 1Y, 3Y, 5Y, Max_History | 回溯期間內資產淨值從最高峰回落至最低谷的最大累計跌幅 |
| `Calmar_Ratio` | 卡瑪比率 | `Annualized Return / |Maximum Drawdown|` | 3Y, 5Y | 年化報酬率與歷史最大回撤之比，衡量回撤承受度下的收益能力 |
| `Tracking_Error` | 追蹤誤差 | `Standard Deviation of (Portfolio Return - Benchmark Return)` | 1Y, 3Y | 投資組合收益偏離被動基準指數的主動風險大小 |
| `Information_Ratio` | 資訊比率 | `Active Return / Tracking Error` | 1Y, 3Y | 每承受一單位主動追蹤風險所獲取的主動超額報酬 |
| `VaR` | 在險價值 | 特定信賴水準下最大預期損失 | 1D_95%, 1D_99%, 10D_99% | 特定信賴水準與期間內，組合可能發生的最大潛在損失 |
| `CVaR` | 條件在險價值 / 預期損失 | 損失超過 VaR 門檻時的條件期望損失 | 1D_95%, 1D_99% | 極端尾端事件突破 VaR 門檻時，預期平均損失的嚴重程度 |
