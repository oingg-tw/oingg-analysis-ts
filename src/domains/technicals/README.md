# 技術分析與價格量能指標（technical_analysis_and_momentum）

- **scope**：Security
- **說明**：基於市場交易價量序列，評估趨勢方向、動能強弱與超買超賣區間。
- **狀態**：⬜ 全部未實作。

## 為什麼整類都還沒做

這類指標全部需要**日線（或更高頻率）的股價與成交量序列**，跟本服務現有的資料完全不同性質——現有資料是 oingg-mops-ts 提供的**季度**財報快照，沒有任何逐日的價格/成交量資料。這不只是缺一個欄位，是缺一整個資料維度（時間序列的市場交易資料），需要全新的資料源與 ingest 管線，跟 [`../valuation/`](../valuation/README.md) 缺股價是同一個根本問題但規模更大（那邊只需要單一時點股價，這裡需要連續序列）。

## 指標清單

| code | 中文名稱 | 公式 | supported_periods | 說明 |
|---|---|---|---|---|
| `MA` | 移動平均線 | `SMA = Sum(Close, N) / N`；`EMA = Price(t) * k + EMA(y) * (1-k)` | 5D/10D/20D/60D/120D/200D | 平滑特定週期收盤價，識別價格趨勢與支撐壓力位 |
| `MACD` | 平滑異同移動平均線 | `DIF = EMA(12) - EMA(26)`；`DEM = EMA(DIF, 9)`；`OSC = DIF - DEM` | Default (12, 26, 9) | 利用指數平滑移動平均線的聚合與發散，捕捉趨勢轉折與動能強弱 |
| `KD` | 隨機指標 | `RSV = (Close - LL)/(HH - LL) * 100`；`K = 2/3*K_prev + 1/3*RSV`；`D = 2/3*D_prev + 1/3*K` | 9D, 14D | 比較特定期間內收盤價在區間的高低位置，評估短期動能轉折 |
| `RSI` | 相對強弱指標 | `RSI = 100 - [100 / (1 + (Average Gain / Average Loss))]` | 6D, 14D, 24D | 衡量特定時間內買賣雙方力道消長，界定超買與超賣區間 |
| `Bollinger_Bands` | 布林通道 | `Middle = SMA(20)`；`Upper = MA + 2σ`；`Lower = MA - 2σ` | 20D, 2σ | 結合移動平均線與常態分佈標準差，呈現動態波動區間與潛在極值 |
| `ATR` | 真實波動區間均值 | 真實波動幅度之移動平均 | 14D, 20D | 衡量標的在特定週期內的絕對波動幅度，常用於部位管理與動態停損 |
| `BIAS` | 乖離率 | `((Close - MA) / MA) * 100%` | 5D, 20D, 60D | 衡量股價偏離移動平均線的百分比，評估均值回歸空間 |
| `VWAP_OBV` | 量價動能指標 | `VWAP = Sum(Price*Volume)/Sum(Volume)`；`OBV = Cumulative Sign(Price Change) * Volume` | Intraday, Daily_Cumulative | 結合成交量與價格變動，評估主力資金流向與實質交易均價成本 |
