# 總體經濟、固定收益與市場情緒（macro_fixed_income_and_sentiment）

- **scope**：Market_Macro
- **說明**：衡量無風險收益基準、利率敏感度、利差結構以及宏觀資產水位於市場情緒定價。
- **狀態**：⬜ 全部未實作。

## 為什麼整類都還沒做

這類指標**跟單一公司財報完全無關**——需要的是總體經濟數據（GDP）、公債殖利率曲線、公司債利差、選擇權隱含波動度（VIX）、賣買權成交量比等總體市場資料，沒有一項能從 oingg-mops-ts 的公司季度財報衍生出來。這是完全獨立於現有「查某公司某季比率」架構之外的資料源與領域，優先度上應該排在其他還缺資料源的分類（[`../valuation/`](../valuation/README.md) 的股價、[`../technicals/`](../technicals/README.md) 的價量序列）之後再考慮，因為那兩類至少還能沿用現有的「公司財報」骨幹，這一類完全是另起爐灶。

## 指標清單

| code | 中文名稱 | 公式 | supported_periods | 說明 |
|---|---|---|---|---|
| `Buffett_Indicator` | 巴菲特指標 | `Total Market Capitalization / GDP` | Quarterly, Annual | 股市總市值相對於一國 GDP 的比率，評估總體股市評價水位 |
| `YTM` | 到期殖利率 | 債券現金流之內部報酬率 | Annualized | 將債券持有至到期日所獲得之複合年化收益率 |
| `Real_Interest_Rate` | 實質利率 | `Nominal Interest Rate - Expected Inflation Rate` | Current, 1Y_Rolling | 名目利率扣除通膨預期後的真實資本回報率與資金成本 |
| `Duration` | 存續期間 | `Macaulay Duration / (1 + YTM/m)` | Current | 利率變動 1% 時，債券價格預期變動百分比的一階線性敏感度 |
| `Convexity` | 凸性 | 價格對殖利率的二階導數 / 價格 | Current | 修正存續期間線性估計誤差的二階曲率，反映價格隨殖利率變化的非線性彈性 |
| `Credit_Spread` | 信用利差 | `Corporate Bond Yield - Benchmark Treasury Yield` | Daily, Spread_to_Treasury | 公司債相對同天期無風險公債的收益率溢價，反映違約信用風險 |
| `Yield_Curve_Spread` | 殖利率曲線利差 | `10-Year Treasury Yield - 2-Year Treasury Yield` | Daily | 長短天期公債利差斜率，作為景氣週期與經濟衰退之預警指標 |
| `VIX` | 恐慌指數 / 波動率指數 | 標普 500 選擇權隱含波動度模型推導 | Daily, 30D_Implied | 標普500指數選擇權在未來30天的隱含波動度與市場避險情緒 |
| `Put_Call_Ratio` | 賣買權成交比率 | `Put Options Volume / Call Options Volume` | Daily, 5D_MA | 選擇權市場賣權與買權比值，用於觀察極端多空情緒與逆勢轉折點 |
