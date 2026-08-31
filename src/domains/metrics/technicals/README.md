# 技術分析與價格量能指標（technical_analysis_and_momentum）

- **scope**：Security
- **說明**：基於市場交易價量序列，評估趨勢方向、動能強弱與超買超賣區間。
- **狀態**：全數實作（`VWAP_OBV` 只做了 OBV，VWAP 本服務結構性做不到，見下方說明）。2026-08-30 完成。

## 資料源：oingg-twse 的 daily_price，覆蓋率不均勻

跟本服務其他指標不同，這一類完全不查 mops 的季度財報表，只用 [`../../../prisma/twse/schema.prisma`](../../../../prisma/twse/schema.prisma) 的 `DailyPrice`（`daily_price`，每日開高低收/成交量），共用邏輯在 [`../../../shared/sourceData/priceSeries.ts`](../../../shared/sourceData/priceSeries.ts)（抓序列、決定基準日）跟 [`../../../shared/technicalMath.ts`](../../../shared/technicalMath.ts)（純數學運算，不碰資料庫，方便獨立測試）。

**2026-08-30 更新（重要，糾正 2026-08-28 的舊記錄）**：先前記錄「1378 檔股票、約 58 個交易日」已經過期，實際查證現況是：

- **6 家種子公司**（2330/2881/2867/2801/2207/2855）有約 **1212 個交易日**（2021-09 至今，約 5 年）——六個 MA 窗口、MACD、所有其他指標都算得出來而且已經收斂。
- **其他 1369 檔股票目前只有 3 天資料**（2026-08-17~2026-08-28）——比 8/28 記錄的 58 天薄很多，連 MA5D、RSI6D 都不夠。看起來覆蓋率不是單調遞增的，這批股票的資料視窗曾經縮小過，原因不明（可能是 oingg-twse 那邊只保留近期滾動窗口，還沒真的開始全市場的長期回填）。

**這正是使用者要求「有多少資料就做多少，沒資料計算上不能出錯」的實際案例**：所有 8 個指標都已經完整實作，資料不夠時對應欄位回傳 `null` 並在 `fieldStatuses` 標成 `no_data`（temporary，之後資料補齊會自動算出來），不會拋錯、不會噴 500——查詢介面完全不管公司實際有多少天資料，同一套程式碼未來資料補齊後不用改就會自動算出更多結果。已經用 6 家種子公司（歷史夠深）、任一檔只有 3 天資料的股票、完全查無資料的 `9999` 三種情境驗證過，見 `tests/domains/technicals/`。

## 為什麼 VWAP 做不到，是結構性缺口不是覆蓋率問題

taxonomy 把 `VWAP_OBV` 列成一個指標，但這裡只做了 OBV：真正的 VWAP（成交量加權平均價）需要當日盤中逐筆或分鐘 K 線資料才能算，`daily_price` 只有每天一筆的開高低收/總量，沒有盤中細節——不管資料累積多少年、多少檔股票，這個缺口都不會自己補上，因為 `daily_price` 這張表的資料顆粒度本身就不夠，不是筆數不夠。跟 MA200D/MACD 那種「資料筆數還沒累積夠，之後會自動解決」的情況是兩回事。

## 計算慣例

- **`MA` 全部是簡單移動平均（SMA），不是指數移動平均**——taxonomy 公式列了兩種算法，但 5D~200D 這幾個窗口是業界慣例的 SMA；EMA 只用在 `MACD`。
- **`RSI`、`ATR` 都用 Wilder 平滑**（前 window 期簡單平均當種子，之後 `avg = (avg_prev * (window-1) + current) / window` 遞迴），不是簡單移動平均版——業界最常見、也是 Wilder 原始定義的版本。
- **`KD` 的 K/D 初始值用業界慣例的 50**，從序列最早能算出 RSV 的地方開始遞迴到基準日，不是只看最新一天的 RSV 就當作 K/D——K/D 本身依賴遞迴的歷史狀態，不能只看單一天。
- **`MACD` 的 EMA 準確度會隨可用歷史筆數收斂**：種子用前 N 筆的 SMA，資料筆數只比 26 天多一點時數值僅供參考，`dataCoverage.emaConverged`（門檻抓 3 倍窗口，約 78 天，業界常見的粗略經驗法則）標示是否已經收斂，`warnings` 會提醒但不會因此回傳 `null`——「有值但精準度存疑」跟「連算都算不出來」是兩種情況。
- **`BIAS` 直接複用 `MA` 的 `simpleMovingAverage` 函式**，同一個窗口長度會得到一樣的 MA 值，MA 算不出來乖離率也就算不出來，不重複實作。
- **`Bollinger_Bands` 用母體標準差**（分母是 N，不是 N-1），業界慣例算法，不是統計課本的樣本標準差。
- **`OBV` 是累積值，沒有跨公司比較意義**——從資料庫目前收錄的最早一筆開始累加，不同公司歷史起點不同，只有同一公司內看趨勢變化才有意義；`prisma/analysis/schema.prisma` 的 `ObvResult.obv` 刻意用 `BigInt` 不是 `Decimal`，`filterCatalogCheck.ts` 只認 `Decimal` 欄位為可 filter 的指標，`obv` 因此自動不會出現在 `filterCatalog.ts`，是刻意的設計，不是漏加。
- **查詢介面是 `companyId` + 選填 `asOfDate`**，跟 `GET /portfolio/beta`、`GET /valuation/market-ratios` 同一種模式，不是 `year`/`season`——技術指標是逐日市場資料，跟財務季度是不同的時間刻度。指定的 `asOfDate` 不是交易日時，自動退回往前最近的交易日並在 `warnings` 註明。

## 指標清單

| code | 中文名稱 | 公式 | supported_periods | 狀態 |
|---|---|---|---|---|
| `MA` | 移動平均線 | `SMA = Sum(Close, N) / N` | 5D/10D/20D/60D/120D/200D | ✅ 已實作 — [`ma/`](ma/)，`GET /technicals/ma` |
| `MACD` | 平滑異同移動平均線 | `DIF = EMA(12) - EMA(26)`；`DEM = EMA(DIF, 9)`；`OSC = DIF - DEM` | Default (12, 26, 9) | ✅ 已實作 — [`macd/`](macd/)，`GET /technicals/macd` |
| `KD` | 隨機指標 | `RSV = (Close - LL)/(HH - LL) * 100`；`K = 2/3*K_prev + 1/3*RSV`；`D = 2/3*D_prev + 1/3*K` | 9D, 14D | ✅ 已實作 — [`kd/`](kd/)，`GET /technicals/kd` |
| `RSI` | 相對強弱指標 | Wilder's RSI | 6D, 14D, 24D | ✅ 已實作 — [`rsi/`](rsi/)，`GET /technicals/rsi` |
| `Bollinger_Bands` | 布林通道 | `Middle = SMA(20)`；`Upper = MA + 2σ`；`Lower = MA - 2σ` | 20D, 2σ | ✅ 已實作 — [`bollingerBands/`](bollingerBands/)，`GET /technicals/bollinger-bands` |
| `ATR` | 真實波動區間均值 | Wilder 平滑的真實波動幅度移動平均 | 14D, 20D | ✅ 已實作 — [`atr/`](atr/)，`GET /technicals/atr` |
| `BIAS` | 乖離率 | `((Close - MA) / MA) * 100%` | 5D, 20D, 60D | ✅ 已實作 — [`bias/`](bias/)，`GET /technicals/bias` |
| `VWAP_OBV` | 量價動能指標 | `OBV = Cumulative Sign(Price Change) * Volume` | Daily_Cumulative | ✅ 只做 OBV — [`obv/`](obv/)，`GET /technicals/obv`；VWAP 結構性做不到，見上方說明 |
