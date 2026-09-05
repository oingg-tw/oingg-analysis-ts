# 成長性指標（growth）

- **scope**：Security
- **說明**：財報數字的期間變動率（YoY/QoQ 營收成長率、EPS 成長率、CAGR⋯⋯），不是某一期的絕對數字或比率快照，而是「跟過去比變化了多少」。
- **狀態**：⬜ 未實作。
- **來源分類方案**：2026-08-24 討論的「第二套分類方案」之一，見 [`README.md`](README.md) 的「第二套分類方案」說明。原始分類表給的項目數是 9，沒有逐項清單。

## 為什麼還沒做

這一類其實不是新概念——[`README.md`](README.md) 的「跨分類的時間轉換算子（temporal_transformation_operators）」已經定義過 `CAGR`、`PoP_Growth`、`Rolling_Average` 這三個算子，說明寫著「本服務目前的指標都是單季/單季年化/TTM，還沒有套用 CAGR、真正的 Rolling Average 這類跨年度算子」——這一類就是把那三個算子（主要是 `PoP_Growth`、`CAGR`）真的套用到既有指標上。技術上沒有資料缺口：算 YoY 成長率只是「查兩個不同季度的同一個欄位再相除」，`getPastNQuarters`（[`../shared/rocQuarter.ts`](../shared/rocQuarter.ts)）這個既有 helper 已經能算出「去年同季」是哪一季，直接可以重用。

沒做的原因單純是還沒排到——這是在既有指標上疊加，不是新開一個資料源，跟 `securityInfo`/`marketData`/`financials` 那種還要決定資料來源/介面設計的情況不一樣，`growth/` 反而是這次盤點裡最接近「隨時可以動工」的空分類。

## 可能套用的對象（已知有 TTM/單季數字可以拿來算成長率的指標）

- 營收成長率：`operatingRevenue`（[`margins/`](margins/)、[`turnoverRatio/`](turnoverRatio/) 都已經查過）。
- EPS 成長率：[`eps/`](eps/) 的 `epsTtm`/`epsQuarterly`。
- 淨利成長率：`netIncome`（幾乎每支 API 都查過，欄位選擇邏輯統一用 `pickNetIncome`）。
- FCF/OCF 成長率：[`cashFlowPerShare/`](cashFlowPerShare/)。

`PoP_Growth`（YoY） = `(本期 - 去年同期) / 去年同期 * 100%`，只需要再查一次「去年同季」的同一張財報表，用 `getPastNQuarters` 往前推 4 季即可定位到哪一季，不需要新的資料源或新的 helper。`CAGR` 需要更長的歷史窗口（3Y/5Y/10Y），會受限於 [`valuation.md`](valuation.md) 提過的「財報資料目前只有民國 110~115 年，6 個年度」這個歷史深度限制——10Y CAGR 目前算不出來，3Y/5Y 應該可以。

## 2026-09-02 存股篩選需求盤點：3 個確定要排入的未來項目

使用者對照一份存股篩選指標研究文件（`docs/定存篩選指標.md`）盤點現有指標覆蓋率，以下 3 項確認目前完全沒有、排入這個分類的未來規劃：

- **EPS 5 年 CAGR 成長率**：套用上面「可能套用的對象」已經列的 [`eps/`](eps/) `epsTtm`，用 `CAGR` 算子算 3Y/5Y（10Y 卡在資料深度，見上）。技術上沒有缺口，是這個分類最先可以動工的項目之一。
- **連續配發股利年數**：跟 `PoP_Growth`/`CAGR` 不是同一種算子——不是「算變化率」，是「數有幾個連續期間符合條件（有發放股利）」，taxonomy 的三個溫度轉換算子沒有定義這種「streak count」，動工前要先決定這算不算現有算子框架的延伸，還是要另外定義一個新算子。資料面：[`profitability.md`](profitability.md) 的 `dividendPayoutRatio` 用的是 `quarterly_cash_flow_statement.dividendsPaid`（現金流量表的「發放現金股利」，季度數字），理論上可以照年度加總、判斷該年是否 > 0 來算「有沒有發股利」，但這是「有沒有付現金股利」，不是傳統定義「股利政策連續配發」（含股票股利、含未支付但已宣告的情況）——口徑要不要對齊需要另外確認。一樣卡在民國 110~115 年、6 個年度的資料深度，算不出文件要求的「10 年連續配發」，最多只能算到 6 年。
- **ROE 近 10 年至少 8 年達標的歷史一致性檢驗**：不是重新算 ROE（[`roe/`](roe/) 已經有），是在既有單季/TTM ROE 之上疊加「回看 N 期、統計達標次數」的篩選邏輯，概念上比較接近 `Rolling_Average` 算子的變形（不是取平均，是取達標比例）。一樣卡在 6 個年度的資料深度，「10 年至少 8 年」目前算不出來，能做的話最多是「6 年至少 X 年」的縮水版本，門檻要不要跟著等比例調整是設計決策，不是查得到查不到的問題。
