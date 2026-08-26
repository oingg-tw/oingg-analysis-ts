# 大師策略與複合量化估值模型（guru_and_composite_valuation_models）

- **scope**：Security
- **說明**：整合經典大師選股準則、動態成長折現與多因子基本面評分模型。
- **狀態**：部分實作（`Graham_NCAV`、`Buffett_Owner_Earnings`、葛拉漢數——最後者是本服務自行歸類的指標，見下方）；`Altman_Z_Score` 資料已無缺口，待實作；`Beneish_M_Score`（2026-08-25 從 `cashFlow` 移入）、`Nissim_Penman_RNOA`／`Greenwald_EPV`（本服務自行歸類，見下方）都還沒做。

## 分類範圍：不是只有 taxonomy 明列的 code

`guru` 這一類收的是「以特定投資人/學者命名、帶有該流派主觀判斷的複合公式」，不是嚴格照 investment_metrics_taxonomy v3.0 的分類走——`Altman_Z_Score` 2026-08-24 從 [`../solvency/`](../solvency/README.md) 移過來、`Beneish_M_Score` 2026-08-25 從 [`../cashFlow/`](../cashFlow/README.md) 移過來都是這個原因：公式本身是財務比率加權組合，跟原分類其他「直接算一個比率」的指標性質不同，但更接近「以學者命名的複合模型」，跟葛拉漢數、NCAV、股東盈餘放在一起比較合理。判斷標準大致是「公式夠複雜（多變量加權組合，不是單一比率）+ 掛名特定研究者/投資人」，之後如果有新的大師公式（無論 taxonomy 有沒有明列），都照這個標準判斷該不該放進來，不是只看 taxonomy 有沒有這個 code——單純的單一比率（例如 Novy-Marx 的 GP/A = 毛利/總資產，本質上是換分子的 ROA）即使有掛名，也不算，該進哪一類還沒決定。

## 未實作指標的現況分三種，不要混為一談

2026-08-25 盤點時發現，之前把 `Piotroski_F_Score`/`Beneish_M_Score` 的 YoY 比較講得太嚴重——`getPastNQuarters`（[`../../shared/rocQuarter.ts`](../../shared/rocQuarter.ts)）這個既有 helper 本來就能定位「去年同季」是哪一季，每支算 TTM 的 API 都在用它抓 4 季，YoY 只需要抓 1 季（比 TTM 更簡單），不是新架構，是舊 pattern 換個查法，優先度應該跟 `Altman_Z_Score` 一樣高。真正分成三種現況：

**A. 現在就能補——不缺資料、不缺架構，純粹還沒排到：**
- `Altman_Z_Score`：五個變數全部有資料（見下方），只差查詢介面設計（year/season 選填 + 市值配日期），是目前唯一已經跟使用者確認過「等資料到位就做」的項目。
- `Nissim_Penman_RNOA`：四個變數全部有資料，只差「NOA 怎麼切營業/融資」這個定義決策要先拍板（見下方），拍板後架構比 `Altman_Z_Score` 更單純。
- `Piotroski_F_Score`：9 項訊號都是跟自己去年同季比較，重用 `getPastNQuarters` 抓 1 季即可，財報欄位全部都有。
- `Beneish_M_Score`：8 個變量同上，也是跟自己去年同期比較，重用同一套查詢模式。

**B. 卡在跨公司查詢——本服務目前完全沒有「一次查多家公司」這種查詢型態：**
- `Greenblatt_Magic_Formula`：需要對一批公司的 Earnings Yield/ROC 排名（`Rank(...)`）。
- `Mohanram_G_Score`：8 項訊號有 7 項要跟同產業其他公司的中位數比（cross-sectional），只有 G3 是單一公司絕對值判斷；另外 G4/G5 要「過去 16 季（4 年）」的變異數，mops 財報資料現在剛好有 6 個年度（約 24 季），數量勉強夠但緊繃——這兩個問題要一起解，不只是跨公司查詢的事。

**C. 真的缺資料——不是架構問題，是資料庫裡沒有這個維度的資料：**
- `Lynch_PEG_Fair_Value`、`Potential_Payback_Period`：都需要「預期成長率」這種前瞻性假設，不是財報現成欄位，taxonomy 也沒定義怎麼推算（用歷史 EPS CAGR 當代理變數是一個選項，但那是要拍板的設計決策，不是查得到查不到的問題）。
- `Greenwald_EPV`：WACC 需要 Beta，Beta 需要歷史股價序列的共變異數，`daily_price` 目前只有 2 天歷史，算不出任何有意義的 Beta，跟 [`../technicals/README.md`](../technicals/README.md)/[`../portfolio/README.md`](../portfolio/README.md) 卡住的是同一個根本問題。

## 指標清單

| code | 中文名稱 | 公式 | supported_periods | 說明 |
|---|---|---|---|---|
| `Graham_NCAV` | 葛拉漢淨流動資產價值 | `(Current Assets - Total Liabilities - Preferred Stock) / Shares` | MRQ, FY | ✅ 已實作 — [`ncav/`](ncav/)，`GET /guru/ncav`。同時回傳安全邊際價（NCAV x 2/3），見下方說明 |
| `Greenblatt_Magic_Formula` | 葛林布雷神奇公式 | `Rank(Earnings Yield = EBIT/EV) + Rank(ROC = EBIT/(Net Working Capital + Net Fixed Assets))` | TTM, FY | ⬜ 未實作。財務數字都已經有（EV = 市值 + 淨負債，市值/淨負債都已經算過），卡在「跨公司排名」不是單一公司查詢，需要新的查詢介面 |
| `Lynch_PEG_Fair_Value` | 彼得林區本益成長模型 | `PEG = PER / Expected Growth Rate; Fair Value = Expected Growth Rate * EPS` | Forward, TTM | ⬜ 未實作，需要「預期成長率」這種前瞻性假設，資料庫沒有現成欄位 |
| `Buffett_Owner_Earnings` | 巴菲特股東盈餘 | `Net Income + D&A - Maintenance CapEx` | TTM, FY | ✅ 已實作（每股版本） — [`ownerEarnings/`](ownerEarnings/)，`GET /guru/owner-earnings`（單季/年化/TTM）。taxonomy 是公司總額，本服務改成每股版本，見下方說明 |
| `Piotroski_F_Score` | 皮爾托斯基分數 | 9 項基本面二元會計訊號加總（0~9） | TTM, FY | ⬜ 未實作。綜合獲利能力、財務槓桿/流動性及營運效率改善之 9 分制質量評分，9 項全部是跟自己去年同季比較 |
| `Mohanram_G_Score` | 莫罕拉姆 G 分數 | 8 項基本面成長/研發效率訊號加總（0~8） | TTM, FY | ⬜ 未實作。針對高估值與高成長標的設計的基本面評分，彌補 F-Score 偏重價值股的限制；跟 `Piotroski_F_Score` 看起來像同一類但架構不同，見下方說明——需要跨公司產業中位數，不是跨期比較 |
| `Potential_Payback_Period` | 潛在回本期模型 | `ln(1 + (Stock Price * ln(1 + g)) / EPS_0) / ln(1 + g)` | Forward_3Y, Forward_5Y | ⬜ 未實作。考量獲利複合成長率下，動態推算收回購股成本所需的真實年數；需要「預期成長率」前瞻假設，跟 `Lynch_PEG_Fair_Value` 卡在同一個問題 |
| `Altman_Z_Score` | 奧特曼 Z 分數 | `1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 0.999*X5` | MRQ, FY | ⬜ 未實作，2026-08-24 從 [`../solvency/`](../solvency/README.md) 移過來（見上方「分類範圍」說明），資料已無缺口，待實作 |
| `Beneish_M_Score` | 貝尼許 M 分數 | `-4.84 + 0.920*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI + 0.115*DEPI - 0.172*SGAI + 4.037*TATA + 0.0327*LVGI` | FY, TTM | ⬜ 未實作，2026-08-25 從 [`../cashFlow/`](../cashFlow/README.md) 移過來（見上方「分類範圍」說明）。8 個變量都是跟去年同期比較，跟 `Piotroski_F_Score` 同一種架構問題，需要跨期比較的查詢模式 |

## 本服務自行歸類的指標（不在 taxonomy 明列的 code 裡）

| 指標 | 提出者 | 公式 | 狀態 |
|---|---|---|---|
| 葛拉漢數（Graham Number） | Benjamin Graham | `sqrt(22.5 x EPS(TTM) x BVPS)` | ✅ 已實作 — [`grahamNumber/`](grahamNumber/)，`GET /guru/graham-number` |
| Nissim & Penman RNOA 拆解 | Doron Nissim & Stephen Penman（2001） | `ROE = RNOA + (FLEV x SPREAD)`，見下方 | ⬜ 未實作，2026-08-25 列入。大部分能做，見下方「Nissim_Penman_RNOA 卡在哪裡」 |
| Greenwald 盈餘能力價值（EPV） | Bruce Greenwald（2001） | `EPV = Adjusted NOPAT / WACC + 過剩現金 - 總負債`，見下方 | ⬜ 未實作，2026-08-25 列入。卡在 WACC 需要 Beta，見下方「Greenwald_EPV 卡在哪裡」 |

taxonomy 列的是 `Graham_NCAV`（葛拉漢淨流動資產價值），跟這裡的「葛拉漢數」是葛拉漢提出的**兩個不同公式**，taxonomy 沒有把葛拉漢數單獨列出來，但這是一個廣為人知、常被引用的獨立公式，所以自行歸類進來。Nissim & Penman、Greenwald 這兩個也是同樣道理——不在 investment_metrics_taxonomy v3.0 裡，但公式複雜、掛名特定學者，符合這一類的分類標準（見上方「分類範圍」）。2026-08-25 使用者提供的清單裡還有 Novy-Marx GP/A（毛利/總資產），因為只是單一比率（換分子的 ROA）沒有收進來，該歸哪一類還沒決定。

**本服務第一個複合指標**：[`grahamNumber/service.ts`](grahamNumber/service.ts) 不自己查資料庫，而是直接呼叫已經寫好的 `calculateEps`（[`../profitability/eps/service.ts`](../profitability/eps/service.ts)）跟 `calculateBvps`（[`../profitability/bvps/service.ts`](../profitability/bvps/service.ts)），取兩者算出來的 `epsTtm`/`bvps` 直接套公式——不重複實作淨利/權益口徑選擇、流通股數查詢那些邏輯。副作用是呼叫這支 API 時，`eps`/`bvps` 兩支服務也會各自照常把自己的結果 upsert 進 `profitability_eps`/`profitability_bvps`，這是預期行為。之後其他複合指標（例如 `Lynch_PEG_Fair_Value` 需要 PER）都可以照這個模式，直接引用既有服務，不要重新查資料庫。

葛拉漢數用 **TTM EPS**（不是單季或簡單年化版本）；EPS 或 BVPS 為零或負值時無法計算（公式假設公司要有正的獲利跟正的淨值）。已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：`sqrt(22.5 x 133.01 x 248.05)` = 葛拉漢數 861.59 元。

## Graham_NCAV（NCAV）計算口徑

- **公式**：NCAV = (流動資產 − 總負債 − 特別股) / 流通股數；回應同時附上安全邊際價 = NCAV x (2/3)——葛拉漢認為用低於 NCAV 三分之二的價格買進才有足夠安全邊際。純資產負債表時點快照，沒有單季/年化/TTM 的區別。
- **特別股欄位一開始是死路，後來 oingg-mops-ts 補上了**：`quarterly_balance_sheet` 原本沒有拆出特別股，2026-08-20 新增了 `preferredStockCapital`（分類為權益）跟 `preferredStockLiability`（分類為金融負債，通常是可贖回特別股）兩個欄位。**NCAV 只扣 `preferredStockCapital`**——`preferredStockLiability` 已經算在 `totalLiabilities` 裡面，重複扣會低估 NCAV。這是用台積電/2887 的資料驗證 `totalLiabilities + totalEquity = totalAssets` 這個恆等式成立才確認的，不是憑空假設。查不到欄位（或本來就沒有特別股）視為 0，不是資料缺漏。
- **這個公式不適用金融/保險業**：查了全部 13 家公司，`2838`、`2850`、`2867`、`2887`、`5843` 這 5 家（都是金控/保險股）`currentAssets` 全部是 `null`——銀行/金控的資產負債表本來就不按流動/非流動分類，NCAV 這個公式本來就是設計給一般產業公司用的，不是資料沒抓到。查詢這幾家公司會正確回傳 `null` 並在 `warnings` 說明原因。
- 已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：流動資產 4,565,700,742 千元 − 總負債 2,901,183,746 千元 − 特別股 0 = NCAV 64.19 元、安全邊際價 42.79 元。用 2887（金控）驗證正確回傳 `null` 並列出三個原因（`currentAssets` 為 null、偵測到有特別股已扣除、`capital_stock_history` 查無資料）。

## Buffett_Owner_Earnings（股東盈餘）計算口徑

- **公式**：每股股東盈餘 = `(淨利 + 折舊 + 攤銷 + 資本支出) x 1000 / 流通股數`。`capitalExpenditures` 在資料庫裡本身是負數（現金流出），所以是加不是減，跟 FCF 同一個坑。
- **taxonomy 原文是公司總額，本服務改成每股版本**：跟 [`../cashFlow/`](../cashFlow/README.md) 的 FCF 一樣，接續 EPS/BVPS/每股營收/每股現金流那條「每股基礎指標」脈絡，方便互相比較，不是照 taxonomy 字面做。
- 用「總資本支出」代替 taxonomy 定義的「維護性資本支出」（Maintenance CapEx）——財報沒有拆分維護性/成長性資本支出，這是跟 FCF 一樣的簡化，算出來的數值會比嚴格定義的股東盈餘保守（偏低）。
- 跟 [`../cashFlow/cashFlowPerShare/`](../cashFlow/cashFlowPerShare/) 同一種單季/年化/TTM 三數值結構。

## Altman_Z_Score 卡在哪裡（2026-08-24 從 solvency 移過來）

taxonomy 列的是原始版（係數 1.2/1.4/3.3/0.6/0.999），拆開五個變數：

| 變數 | 公式 | 有資料嗎 |
|---|---|---|
| X1 | (流動資產 − 流動負債) / 總資產 | ✅ 有 |
| X2 | 保留盈餘（`retainedEarnings`） / 總資產 | ✅ 有 |
| X3 | EBIT / 總資產 | ✅ 有（[`../solvency/interestCoverage/`](../solvency/interestCoverage/)/[`../solvency/netDebtToEbitda/`](../solvency/netDebtToEbitda/) 已經在算 EBIT） |
| X4 | **股票市值** / 總負債 | ✅ 有——2026-08-21 驗證過 oingg-twse 的 `company_profile.issued_shares` x `daily_price.close`（見 [`../securityInfo/README.md`](../securityInfo/README.md)），1394 家公司 `issued_shares` 覆蓋率完整；`daily_price` 目前只有 2 天歷史，配到「某季財報報告日」的股價還是會常常是 `null`，跟 [`../valuation/marketRatios/`](../valuation/marketRatios/) 踩過的坑一樣 |
| X5 | 營收 / 總資產 | ✅ 有——就是 [`../turnover/turnoverRatio/`](../turnover/turnoverRatio/) 已經算好的總資產週轉率，公式完全一樣 |

五個變數現在全部有資料，2026-08-20 曾經跟使用者確認過「先擱置，等 valuation 接上股價資料源後直接做原始版，不做 Z'-Score（權益帳面價值版）替代版本」——那個前提條件現在已經滿足了，待實作。查詢介面要仿照 [`../valuation/marketRatios/`](../valuation/marketRatios/) 的教訓，不要套用季度查詢模板去配股價，應該用「季度基本面（X1/X2/X3/X5）+ 選填日期的股價（X4）」這種介面，跟 [`../valuation/README.md`](../valuation/README.md) 討論 PSR/P_FCF/EV_EBITDA 查詢介面時同一個設計決策（year/season 選填，沒指定就抓最新）。

## Nissim_Penman_RNOA 卡在哪裡

核心公式 `ROE = RNOA + (FLEV x SPREAD)`，把 ROE 拆成「營業活動賺的報酬」跟「financial leverage 放大的部分」，用意是揪出「ROE 很高但其實是借錢堆出來的」公司。拆開來看每個變數：

| 變數 | 公式 | 有資料嗎 |
|---|---|---|
| NOPAT | `營業利益（operatingIncome） x (1 - 有效稅率)` | ✅ 有——比 `roic/`/`roce/` 用的 EBIT（稅前淨利+利息費用反推）更單純，`operatingIncome` 是財報現成欄位，不用反推；有效稅率算法跟 `roic/` 一致（`incomeTaxExpense / profitBeforeTax`） |
| 淨營業資產（NOA） | 營業資產 − 營業負債 | 🟡 財報沒有「營業 vs 融資」的分類欄位，要自己訂規則：營業負債大致 = 總負債 − 有息負債（`shortTermBorrowings`+`bondsPayable`+`longTermBorrowings`，`deRatio`/`roic` 已經在用的口徑）；營業資產大致 = 總資產 − 現金及約當現金（把現金當成非營業的金融資產）。這是這個指標唯一要先拍板的地方，不是缺資料 |
| 淨金融負債 | 有息負債 − 現金及約當現金 | ✅ 有——`roic/` 已經算過同樣的東西 |
| NBC（淨借貸利率） | `financeCosts / 淨金融負債` | ✅ 有 |

跟 `Altman_Z_Score` 不一樣的地方：這個不是「卡資料」，是卡「NOA 怎麼切」這個定義決策——決策一旦拍板，四個變數都能算，沒有資料缺口，也不需要跨公司/跨期比較，架構上比 `Greenblatt_Magic_Formula`/`Piotroski_F_Score` 都單純，是這次盤點裡除了 `Altman_Z_Score` 之外最接近「可以直接動工」的一個。

## Greenwald_EPV 卡在哪裡

跟前面幾個不一樣，這個是真的卡資料，不是卡架構或定義：

- **常態化營業利潤**（過去 5 年平均營業利益率 x 當前營收）勉強算得出來——mops 財報資料現在有 6 個年度，5 年平均在可行範圍內。
- **WACC（加權平均資金成本）算不出來**：需要股權成本（通常用 CAPM：無風險利率 + Beta x 市場風險溢酬），Beta 需要個股報酬率跟大盤報酬率的歷史序列共變異數——這正是 [`../technicals/README.md`](../technicals/README.md)、[`../portfolio/README.md`](../portfolio/README.md) 卡住的同一個根本問題：`daily_price` 目前只有 2 天歷史，算不出任何有意義的 Beta。債務成本（Cost of Debt）用 `financeCosts / totalDebt` 勉強可以估，但股權成本這塊完全卡住。
- 就算 WACC 有辦法用簡化方式帶入（例如固定折現率），「資產重置成本（Reproduction Cost of Assets）」這個判斷護城河用的比較基準，本身也需要額外的資產評估邏輯，不是財報現成欄位。

這個指標卡的地方跟 `technicals`/`portfolio` 兩個空分類本質上是同一個「缺歷史股價序列」問題，不是本服務能單獨解決的，建議排在那兩個分類真的要動工的時候再一起考慮。
