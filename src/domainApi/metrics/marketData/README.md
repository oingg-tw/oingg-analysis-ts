# 市場行情數據（market_data）

- **scope**：Security
- **說明**：逐日的原始市場交易數據（股價、成交量⋯⋯）跟由它直接衍生的簡單統計量（52 週高低、平均成交量⋯⋯），跟 [`../valuation/`](../valuation/README.md) 已經算好的估值比率（PER/PBR）、[`../technicals/`](../technicals/README.md) 的技術指標是不同層級——這一類是最原始的行情資料本身。
- **狀態**：⬜ 未實作。
- **來源分類方案**：2026-08-24 討論的「第二套分類方案」之一，見 [`../README.md`](../README.md) 的「第二套分類方案」說明。原始分類表給的項目數是 37，沒有逐項清單，下面只列已知確實存在、能對應到真實欄位的部分。

## 為什麼還沒做

跟 [`../technicals/`](../technicals/README.md) 卡住的原因一樣：oingg-twse 的 `daily_price` 雖然已經接上（2026-08-19），但截至 2026-08-21 只有 2 個交易日的資料——像「52 週最高/最低」、「近 20 日均量」這種需要一段連續歷史窗口的統計量，現在完全算不出來，只有「當天/最新一筆」這種不需要歷史窗口的欄位可以直接查。

## 已知的真實資料來源

`daily_price`（oingg-twse，已鏡像進 [`../../../prisma/twse/schema.prisma`](../../../../prisma/twse/schema.prisma)，欄位是 camelCase）：`open`／`high`／`low`／`close`／`volume`（成交股數）／`turnover`（成交金額）／`transaction`（成交筆數）／`monthlyAvg`（月平均價）。

`daily_valuation`（同樣已鏡像，目前只有 [`../valuation/marketRatios/`](../valuation/marketRatios/) 在用）：`peRatio`／`pbRatio`／`dividendYield`——這幾個算是「行情數據」還是「估值指標」，取決於這套新分類方案怎麼切，目前先留在 `valuation/`，不重複搬。

需要歷史窗口才能算的（52 週高低、平均成交量、`monthlyAvg` 以外的自訂週期均價⋯⋯）都要等 `daily_price` 資料量真的累積起來才有意義，不是程式邏輯的問題。
