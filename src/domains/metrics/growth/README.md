# 成長性指標（growth）

- **scope**：Security
- **說明**：財報數字的期間變動率（YoY/QoQ 營收成長率、EPS 成長率、CAGR⋯⋯），不是某一期的絕對數字或比率快照，而是「跟過去比變化了多少」。
- **狀態**：⬜ 未實作。
- **來源分類方案**：2026-08-24 討論的「第二套分類方案」之一，見 [`../README.md`](../README.md) 的「第二套分類方案」說明。原始分類表給的項目數是 9，沒有逐項清單。

## 為什麼還沒做

這一類其實不是新概念——[`../README.md`](../README.md) 的「跨分類的時間轉換算子（temporal_transformation_operators）」已經定義過 `CAGR`、`PoP_Growth`、`Rolling_Average` 這三個算子，說明寫著「本服務目前的指標都是單季/單季年化/TTM，還沒有套用 CAGR、真正的 Rolling Average 這類跨年度算子」——這一類就是把那三個算子（主要是 `PoP_Growth`、`CAGR`）真的套用到既有指標上。技術上沒有資料缺口：算 YoY 成長率只是「查兩個不同季度的同一個欄位再相除」，`getPastNQuarters`（[`../../shared/rocQuarter.ts`](../../../shared/rocQuarter.ts)）這個既有 helper 已經能算出「去年同季」是哪一季，直接可以重用。

沒做的原因單純是還沒排到——這是在既有指標上疊加，不是新開一個資料源，跟 `securityInfo`/`marketData`/`financials` 那種還要決定資料來源/介面設計的情況不一樣，`growth/` 反而是這次盤點裡最接近「隨時可以動工」的空分類。

## 可能套用的對象（已知有 TTM/單季數字可以拿來算成長率的指標）

- 營收成長率：`operatingRevenue`（[`../profitability/margins/`](../profitability/margins/)、[`../turnover/turnoverRatio/`](../turnover/turnoverRatio/) 都已經查過）。
- EPS 成長率：[`../profitability/eps/`](../profitability/eps/) 的 `epsTtm`/`epsQuarterly`。
- 淨利成長率：`netIncome`（幾乎每支 API 都查過，欄位選擇邏輯統一用 `pickNetIncome`）。
- FCF/OCF 成長率：[`../cashFlow/cashFlowPerShare/`](../cashFlow/cashFlowPerShare/)。

`PoP_Growth`（YoY） = `(本期 - 去年同期) / 去年同期 * 100%`，只需要再查一次「去年同季」的同一張財報表，用 `getPastNQuarters` 往前推 4 季即可定位到哪一季，不需要新的資料源或新的 helper。`CAGR` 需要更長的歷史窗口（3Y/5Y/10Y），會受限於 [`../valuation/README.md`](../valuation/README.md) 提過的「財報資料目前只有民國 110~115 年，6 個年度」這個歷史深度限制——10Y CAGR 目前算不出來，3Y/5Y 應該可以。
