# 大師策略與複合量化估值模型（guru_and_composite_valuation_models）

- **scope**：Security
- **說明**：整合經典大師選股準則、動態成長折現與多因子基本面評分模型。
- **狀態**：部分實作（`Graham_NCAV`、`Buffett_Owner_Earnings`、`Altman_Z_Score`、`Piotroski_F_Score`、`Beneish_M_Score`、葛拉漢數、`Nissim_Penman_RNOA`、Zmijewski Score、Ohlson O-Score——後四者是本服務自行歸類的指標，見下方）。`Greenwald_EPV` 2026-08-25 曾列入評估，2026-08-28 決定不做並移除，見下方「為什麼不做 Greenwald_EPV」。

## 分類範圍：不是只有 taxonomy 明列的 code

`guru` 這一類收的是「以特定投資人/學者命名、帶有該流派主觀判斷的複合公式」，不是嚴格照 investment_metrics_taxonomy v3.0 的分類走——`Altman_Z_Score` 2026-08-24 從 [`../resilience/`](../resilience/README.md) 移過來、`Beneish_M_Score` 2026-08-25 從 [`../cashFlow/`](../cashFlow/README.md) 移過來都是這個原因：公式本身是財務比率加權組合，跟原分類其他「直接算一個比率」的指標性質不同，但更接近「以學者命名的複合模型」，跟葛拉漢數、NCAV、股東盈餘放在一起比較合理。判斷標準大致是「公式夠複雜（多變量加權組合，不是單一比率）+ 掛名特定研究者/投資人」，之後如果有新的大師公式（無論 taxonomy 有沒有明列），都照這個標準判斷該不該放進來，不是只看 taxonomy 有沒有這個 code——單純的單一比率（例如 Novy-Marx 的 GP/A = 毛利/總資產，本質上是換分子的 ROA）即使有掛名，也不算，該進哪一類還沒決定。

**2026-08-30 追加一條篩選條件：公式裡的係數是不是用特定歷史年代/國家資料迴歸校準出來的，如果是，implement 之前要先跟使用者確認，不是做完才補免責聲明。** `Zmijewski_Score`/`Ohlson_O_Score` 都是這種模型（1970~80 年代美國公司資料校準），套用到台股時絕對數值（尤其是機率）已經失去校準基礎，只能當同一家公司的相對趨勢參考——這件事雖然在實作完後有補上「已知限制」免責聲明，但使用者事後回饋這類模型應該在提案階段就先篩掉，不要等做完才講。之後如果還有類似的候選（例如 Fulmer H-Score、Springate、Taffler Z-Score 這種其他破產預警迴歸模型），要先跟使用者確認要不要做，不要直接動工。跟這條規則無關、可以正常做的：純粹是會計恆等式或比率組合的模型（`dupont`、`Nissim_Penman_RNOA`）、沒有校準權重的二元訊號加總（`Piotroski_F_Score`、`Mohanram_G_Score`）、跨公司排名比較（`Greenblatt_Magic_Formula`）——這些都沒有「校準會隨時間/地域失效」的問題。

## 未實作指標的現況分兩種，不要混為一談

2026-08-25 盤點時發現，之前把 `Piotroski_F_Score`/`Beneish_M_Score` 的 YoY 比較講得太嚴重——`getPastNQuarters`（[`../../shared/rocQuarter.ts`](../../../shared/rocQuarter.ts)）這個既有 helper 本來就能定位「去年同季」是哪一季，每支算 TTM 的 API 都在用它抓 4 季，YoY 只需要抓 1 季（比 TTM 更簡單），不是新架構，是舊 pattern 換個查法。2026-08-27 兩個都已實作，2026-08-28 `Nissim_Penman_RNOA` 也實作了（見下方指標清單），真正判斷剩下的分兩種現況：

**A. 卡在跨公司查詢——本服務目前完全沒有「一次查多家公司」這種查詢型態：**
- `Greenblatt_Magic_Formula`：需要對一批公司的 Earnings Yield/ROC 排名（`Rank(...)`）。
- `Mohanram_G_Score`：8 項訊號有 7 項要跟同產業其他公司的中位數比（cross-sectional），只有 G3 是單一公司絕對值判斷；另外 G4/G5 要「過去 16 季（4 年）」的變異數，mops 財報資料現在剛好有 6 個年度（約 24 季），數量勉強夠但緊繃——這兩個問題要一起解，不只是跨公司查詢的事。

**B. 真的缺資料——不是架構問題，是資料庫裡沒有這個維度的資料：**
- `Lynch_PEG_Fair_Value`、`Potential_Payback_Period`：都需要「預期成長率」這種前瞻性假設，不是財報現成欄位，taxonomy 也沒定義怎麼推算（用歷史 EPS CAGR 當代理變數是一個選項，但那是要拍板的設計決策，不是查得到查不到的問題）。

## 指標清單

| code | 中文名稱 | 公式 | supported_periods | 說明 |
|---|---|---|---|---|
| `Graham_NCAV` | 葛拉漢淨流動資產價值 | `(Current Assets - Total Liabilities - Preferred Stock) / Shares` | MRQ, FY | ✅ 已實作 — [`ncav/`](ncav/)，`GET /guru/ncav`。同時回傳安全邊際價（NCAV x 2/3），見下方說明 |
| `Greenblatt_Magic_Formula` | 葛林布雷神奇公式 | `Rank(Earnings Yield = EBIT/EV) + Rank(ROC = EBIT/(Net Working Capital + Net Fixed Assets))` | TTM, FY | ⬜ 未實作。財務數字都已經有（EV = 市值 + 淨負債，市值/淨負債都已經算過），卡在「跨公司排名」不是單一公司查詢，需要新的查詢介面 |
| `Lynch_PEG_Fair_Value` | 彼得林區本益成長模型 | `PEG = PER / Expected Growth Rate; Fair Value = Expected Growth Rate * EPS` | Forward, TTM | ⬜ 未實作，需要「預期成長率」這種前瞻性假設，資料庫沒有現成欄位 |
| `Buffett_Owner_Earnings` | 巴菲特股東盈餘 | `Net Income + D&A - Maintenance CapEx` | TTM, FY | ✅ 已實作（每股版本） — [`ownerEarnings/`](ownerEarnings/)，`GET /guru/owner-earnings`（單季/年化/TTM）。taxonomy 是公司總額，本服務改成每股版本，見下方說明 |
| `Piotroski_F_Score` | 皮爾托斯基分數 | 9 項基本面二元會計訊號加總（0~9） | TTM, FY | ✅ 已實作，2026-08-27 — [`piotroskiFScore/`](piotroskiFScore/)，`GET /guru/piotroski-f-score`。9 項全部是跟自己去年同季比較，計算口徑見下方 |
| `Mohanram_G_Score` | 莫罕拉姆 G 分數 | 8 項基本面成長/研發效率訊號加總（0~8） | TTM, FY | ⬜ 未實作。針對高估值與高成長標的設計的基本面評分，彌補 F-Score 偏重價值股的限制；跟 `Piotroski_F_Score` 看起來像同一類但架構不同，見下方說明——需要跨公司產業中位數，不是跨期比較 |
| `Potential_Payback_Period` | 潛在回本期模型 | `ln(1 + (Stock Price * ln(1 + g)) / EPS_0) / ln(1 + g)` | Forward_3Y, Forward_5Y | ⬜ 未實作。考量獲利複合成長率下，動態推算收回購股成本所需的真實年數；需要「預期成長率」前瞻假設，跟 `Lynch_PEG_Fair_Value` 卡在同一個問題 |
| `Altman_Z_Score` | 奧特曼 Z 分數 | `1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 0.999*X5` | MRQ, FY | ✅ 已實作（原始版），2026-08-27 — [`altmanZScore/`](altmanZScore/)，`GET /guru/altman-z-score`。2026-08-24 從 [`../resilience/`](../resilience/README.md) 移過來（見上方「分類範圍」說明），計算口徑見下方 |
| `Beneish_M_Score` | 貝尼許 M 分數 | `-4.84 + 0.920*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI + 0.115*DEPI - 0.172*SGAI + 4.037*TATA + 0.0327*LVGI` | FY, TTM | ✅ 已實作，2026-08-27 — [`beneishMScore/`](beneishMScore/)，`GET /guru/beneish-m-score`。2026-08-25 從 [`../cashFlow/`](../cashFlow/README.md) 移過來（見上方「分類範圍」說明），8 個變量除了 TATA 都跟去年同期比較，計算口徑見下方 |

## 本服務自行歸類的指標（不在 taxonomy 明列的 code 裡）

| 指標 | 提出者 | 公式 | 狀態 |
|---|---|---|---|
| 葛拉漢數（Graham Number） | Benjamin Graham | `sqrt(22.5 x EPS(TTM) x BVPS)` | ✅ 已實作 — [`grahamNumber/`](grahamNumber/)，`GET /guru/graham-number` |
| Nissim & Penman RNOA 拆解 | Doron Nissim & Stephen Penman（2001） | `ROE = RNOA + (FLEV x SPREAD)`，見下方 | ✅ 已實作，2026-08-28 — [`nissimPenmanRnoa/`](nissimPenmanRnoa/)，`GET /guru/nissim-penman-rnoa`（單季/年化/TTM），計算口徑見下方 |
| Zmijewski Score | Mark Zmijewski（1984） | `X = -4.3 - 4.5*(NI/TA) + 5.7*(TL/TA) - 0.004*(CA/CL)`，見下方 | ✅ 已實作 — [`zmijewskiScore/`](zmijewskiScore/)，`GET /guru/zmijewski-score`，計算口徑見下方 |
| Ohlson O-Score | James Ohlson（1980） | 9 個財務比率加權組合的 Logit 模型，見下方 | ✅ 已實作 — [`ohlsonOScore/`](ohlsonOScore/)，`GET /guru/ohlson-o-score`，計算口徑見下方 |

taxonomy 列的是 `Graham_NCAV`（葛拉漢淨流動資產價值），跟這裡的「葛拉漢數」是葛拉漢提出的**兩個不同公式**，taxonomy 沒有把葛拉漢數單獨列出來，但這是一個廣為人知、常被引用的獨立公式，所以自行歸類進來。Nissim & Penman、Zmijewski、Ohlson 也是同樣道理——不在 investment_metrics_taxonomy v3.0 裡，但公式複雜、掛名特定學者，符合這一類的分類標準（見上方「分類範圍」）。Zmijewski Score、Ohlson O-Score 是 2026-08-30 使用者要求「破產預警模型，只要資料完整沒問題就做」新增列入並直接實作的——跟 `Altman_Z_Score` 同一種「以特定學者命名的財務危機預警複合模型」，資料需求量級也相同（都是資產負債表/損益表/現金流量表衍生比率，不需要跨公司比較或前瞻性假設）。2026-08-25 使用者提供的清單裡還有 Novy-Marx GP/A（毛利/總資產），因為只是單一比率（換分子的 ROA）沒有收進來，該歸哪一類還沒決定；Greenwald EPV 也曾經列入評估，2026-08-28 決定移除，見下方「為什麼不做 Greenwald_EPV」。

**本服務第一個複合指標**：[`grahamNumber/service.ts`](grahamNumber/service.ts) 不自己查資料庫，而是直接呼叫已經寫好的 `calculateEps`（[`../profitability/eps/service.ts`](../profitability/eps/service.ts)）跟 `calculateBvps`（[`../profitability/bvps/service.ts`](../profitability/bvps/service.ts)），取兩者算出來的 `epsTtm`/`bvps` 直接套公式——不重複實作淨利/權益口徑選擇、流通股數查詢那些邏輯。副作用是呼叫這支 API 時，`eps`/`bvps` 兩支服務也會各自照常把自己的結果 upsert 進 `profitability_eps`/`profitability_bvps`，這是預期行為。之後其他複合指標（例如 `Lynch_PEG_Fair_Value` 需要 PER）都可以照這個模式，直接引用既有服務，不要重新查資料庫。

葛拉漢數用 **TTM EPS**（不是單季或簡單年化版本）；EPS 或 BVPS 為零或負值時無法計算（公式假設公司要有正的獲利跟正的淨值）。已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：`sqrt(22.5 x 86.27 x 248.05)` = 葛拉漢數 693.89 元（2026-08-27 更新：oingg-mops-ts 修正 `quarterly_income_statement` 的 Q4 資料後 TTM EPS 改變，原本是 133.01 元/葛拉漢數 861.59 元，見 [`../../../../README.md`](../../../../README.md) 的說明）。

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

## Altman_Z_Score 計算口徑（2026-08-24 從 resilience 移過來，2026-08-27 實作）

taxonomy 列的是原始版（係數 1.2/1.4/3.3/0.6/0.999），五個變數：

| 變數 | 公式 | 資料來源 |
|---|---|---|
| X1 | (流動資產 − 流動負債) / 總資產 | 資產負債表，純時點快照 |
| X2 | 保留盈餘（`retainedEarnings`） / 總資產 | 資產負債表 |
| X3 | EBIT（TTM） / 總資產 | 直接引用 [`../resilience/interestCoverage/`](../resilience/interestCoverage/) 已經算好的 `ebitTtm`，不重複查詢 |
| X4 | **股權市值** / 總負債帳面值 | 見下方「市值資料源」 |
| X5 | 營收（TTM） / 總資產 | 直接引用 [`../turnover/turnoverRatio/`](../turnover/turnoverRatio/) 已經算好的 `assetTurnoverTtm`（本來就是「營收 TTM/總資產」，公式完全一樣） |

**市值資料源**：實際開發時發現 2026-08-21 討論過的 oingg-twse `company_profile.issued_shares` x `daily_price.close` 這條路線不適合——`issued_shares` 是「現在」的股數快照，不是某個歷史時點的股數，拿去配歷史財報季度的市值會不準。改用跟 [`../portfolio/beta/`](../portfolio/beta/) 一樣的資料源：個股收盤價 x `capital_stock_history`（mops，股價基準日當下生效的股本，`getPaidInSharesAsOf`）。收盤價原本用 mops 的 `daily_stock_price`，該表 2026-08-30 從資料庫消失，改用 oingg-twse 的 `daily_price`（見 [`../../../shared/sourceData/marketCap.ts`](../../../shared/sourceData/marketCap.ts)）。**覆蓋率會持續成長**（6 家種子公司 2330/2881/2867/2801/2207/2855 回填了約 5 年歷史，其他公司多半只有近幾個月），完全查無資料的公司 X4/zScore 會是 `null`，`fieldStatuses` 標成 `not_applicable`；覆蓋範圍內但這次查詢缺別的東西（例如 `capital_stock_history` 對不上股價基準日），標成 `no_data`——判斷邏輯見 `hasStockPriceCoverage`，不要在程式碼裡寫死特定公司代號判斷「這家公司有沒有股價資料」。

**股價基準日不是財報期末日，是財報公告日（2026-08-28 修正）**：一開始直接拿 `reportDate`（資產負債表的期末日，例如 115Q2 是 2026-06-30）當股價基準日，這是錯的——期末日只是會計期間的結尾，市場在那天根本還不知道這一季財報數字（依規定財報要再等約 45 天才會公告），拿期末日查股價等於是 look-ahead bias（用了市場當時還不知道的未來資訊）。正確作法是用 `financial_report_announcement` 這張表的 `announcementDate`（財報實際對外公告、市場才真的能反應的那一天）；查無公告日才退回 `reportDate` 並在 `warnings` 註明可能有 look-ahead bias，見 [`../../../shared/sourceData/reportAnnouncementDate.ts`](../../../shared/sourceData/reportAnnouncementDate.ts) 的 `getPriceAnchorDate`。回應多了 `marketCap.priceAnchorSource`（`'announcement'` 或 `'report_date_fallback'`）標明這次用的是哪一種。已用 2330 114Q2（有公告日 2025-08-12，比期末日 2025-06-30 晚 43 天）驗證正確優先採用公告日。

**`financial_report_announcement` 目前覆蓋範圍**（2026-08-28 更新，非缺陷）：負責 ingest 的服務提供了 `POST /api/ingest/financial-report-announcements/backfill`，目前已用 2330/2887/6488 三家公司 114 年度整年真實資料驗證過（各抓到 4/4 筆：114Q1~Q3 + 113 年報，0 警訊），資料正確、不是漏抓。覆蓋範圍是刻意先驗證這 3 家公司，還沒涵蓋到本服務常用的測試季度 115Q2（會落到 `reportDate` fallback），之後可以再對其他公司/季度呼叫 backfill API 擴大範圍，`getPriceAnchorDate` 的 fallback 設計本來就是為了讓覆蓋範圍逐步擴大時不用改程式碼。

**查詢介面**：`year`/`season` 選填（要嘛都給要嘛都不給），不給就自動抓最新一季有資產負債表資料的季度——跟 [`../valuation/marketRatios/`](../valuation/marketRatios/) 只有市值日期選填不同，這是本服務第一個「財報季度 + 市值日期都自動抓最新」的指標。市值抓的是「該季報告日或之前最近一個交易日」的收盤價，不是查詢當下的最新股價。

**單位陷阱**：市值算出來是「股價 x 實際股數」的真實新台幣金額，但財報金額欄位（`totalLiabilities` 等）單位是千元——X4 分母要先 x1000 換算成同一個單位再除，不然會差 1000 倍。這是跟 BVPS 曾經漏過的同一個坑，開發時就踩到一次（有測試在，抓出來了才修正）。

判讀切點：`Z > 2.99` Safe、`1.81 ≤ Z ≤ 2.99` Grey、`Z < 1.81` Distress（原始版切點，跟 Z''-Score 不同，本服務只做原始版，見上方適用性警告）。

已用台積電（2330）115Q2（2026 Q2）合併報表實測驗證：X1=0.2888、X2=0.6454、X3=0.2858、X5=0.47（都是純財報衍生，不受股價影響）；X4 因為要配股價會隨時間變動，2026-08-27 測得 21.54（市值約 62.5 兆元 ÷ 總負債約 2.9 兆元）；Z = 15.59，落在 Safe 區間，符合台積電財務體質極佳、幾乎零槓桿的直覺。

## Piotroski_F_Score 計算口徑（2026-08-27 實作）

9 項二元訊號，全部是「本季 vs 去年同季」的自我比較（YoY, self-referential），不需要跨公司或跨產業比較：

| # | 訊號 | 判斷條件 |
|---|---|---|
| 1 | ROA 為正 | 本季淨利 / 本季總資產 > 0 |
| 2 | 營運現金流為正 | 本季 CFO > 0 |
| 3 | ROA 較去年同季提升 | 本季 ROA > 去年同季 ROA |
| 4 | 盈餘品質 | 本季 CFO > 本季淨利 |
| 5 | 長期負債比率下降 | (長期借款/總資產)本季 < (長期借款/總資產)去年同季 |
| 6 | 流動比率提升 | (流動資產/流動負債)本季 > 去年同季 |
| 7 | 無稀釋 | 本季流通股數 ≤ 去年同季流通股數（`capital_stock_history`，用報告日各自對應生效的股本） |
| 8 | 毛利率提升 | (毛利/營收)本季 > 去年同季 |
| 9 | 總資產週轉率提升 | (營收/總資產)本季 > 去年同季 |

**「去年同季」用 `getPastNQuarters` 往前推 4 季定位**（跟每支算 TTM 的 API 定位「近四季」用同一個 helper，只是這裡只取頭尾兩個點，不加總）。**9 項全部能判斷才給總分**——任一項因為本季或去年同季資料缺漏而無法判斷，`score` 整個是 `null`（不會用「幾項算出來就算幾項」湊一個打折的分數），`signals` 陣列列出每一項各自的判斷結果，方便定位是哪一項卡住。

已用台積電（2330）115Q2 vs 114Q2（去年同季）合併報表實測驗證：score = 8/9，唯一沒過的是「長期負債比率下降」——台積電這幾年持續舉債擴廠支應先進製程資本支出，長期負債比率上升是預期中的，不是財務體質變差的訊號，其餘 8 項（獲利能力、現金流品質、流動性、無稀釋、毛利率、週轉率）都過。

## Beneish_M_Score 計算口徑（2026-08-25 從 cashFlow 移過來，2026-08-27 實作）

8 個變量，除了 TATA（只看本季）以外全部是「本季 vs 去年同季」的自我比較：

| 變量 | 公式 | 說明 |
|---|---|---|
| DSRI | (應收帳款/營收)本季 ÷ (應收帳款/營收)去年同季 | 應收帳款增速異常飆升 → 灌水營收的訊號 |
| GMI | (毛利率)去年同季 ÷ (毛利率)本季 | >1 代表毛利率惡化（去年比較高），是造假動機指標 |
| AQI | [1-(流動資產+PPE)/總資產]本季 ÷ 去年同季 | 簡化版：原始定義還要扣有價證券，財報沒有單獨的有價證券欄位 |
| SGI | 本季營收 ÷ 去年同季營收 | 唯一直接比、不是「比率再比」的變量 |
| DEPI | (折舊率)去年同季 ÷ (折舊率)本季 | 折舊率 = 折舊/(折舊+PPE)，只用 `depreciation`（不含 `amortization`），對應嚴格定義的固定資產折舊率 |
| SGAI | (SGA/營收)本季 ÷ 去年同季 | SGA = `sellingExpenses` + `adminExpenses`（財報是分開兩個欄位，這裡加總） |
| TATA | (本季淨利 − 本季 CFO) / 本季總資產 | 唯一不跟去年比較的變量，衡量帳面利潤與現金脫鉤程度 |
| LVGI | (總負債/總資產)本季 ÷ 去年同季 | 簡化版：原始定義是「長期負債+流動負債」，這裡直接用總負債（等於兩者加總） |

`M = -4.84 + 0.920*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI + 0.115*DEPI - 0.172*SGAI + 4.037*TATA + 0.0327*LVGI`，**8 個變量全部能計算才給 M-Score**。判別門檻是原始論文定的，不是本服務自訂：`M-Score > -1.78` 財務造假/營收灌水風險較高（`flagged: true`），`M-Score ≤ -1.78` 財務數據可信度較高。

**已知限制：對高成長公司容易偽陽性**——模型裡權重最大的兩個係數（SGI 的 0.892、TATA 的 4.037）都跟「成長」有關，一家正常高速成長的公司（營收大幅成長、應收帳款/資本支出跟著等比例擴張）很容易被模型誤判成「疑似造假」，這是 Beneish M-Score 本身的已知限制，不是本服務的計算錯誤。已用台積電（2330）115Q2 vs 114Q2（去年同季）合併報表實測驗證：SGI=1.3605（營收 YoY 成長 36%）、TATA=-0.0082（應計項目其實是負的，代表現金流比帳面淨利還好，是正面訊號），M-Score = -1.4827，`flagged: true`——這是模型對台積電這種高速成長期公司的典型偽陽性，不代表台積電財報有異常（NCAV、Piotroski F-Score、Altman Z-Score 這幾個已實作指標都顯示台積電財務體質良好）。

## Nissim_Penman_RNOA 計算口徑（2026-08-28 實作）

核心公式 `ROE = RNOA + (FLEV x SPREAD)`，把 ROE 拆成「營業活動賺的報酬」跟「financial leverage 放大的部分」，用意是揪出「ROE 很高但其實是借錢堆出來的」公司。

| 變數 | 公式 | 說明 |
|---|---|---|
| NOPAT | `營業利益（operatingIncome） x (1 - 有效稅率)` | 比 `roic/`/`roce/` 用的 EBIT（稅前淨利+利息費用反推）更單純，`operatingIncome` 是財報現成欄位，不用反推；有效稅率算法跟 `roic/` 一致（`incomeTaxExpense / profitBeforeTax`），稅前淨利為零或負數時無法計算 |
| NOA（淨營業資產） | `權益 + NFO` | 財報沒有「營業 vs 融資」的分類欄位，用數學恆等式繞開逐科目分類：`NOA = 營業資產 - 營業負債 = (總資產-金融資產) - (總負債-金融負債) = 總權益 + (金融負債-金融資產) = 總權益 + NFO`。金融資產只能是 `cashAndEquivalents`（mops 沒有更細的「短期投資」欄位可選）；金融負債沿用 `deRatio`/`roic` 已經在用的「有息負債」口徑（`shortTermBorrowings`+`bondsPayable`+`longTermBorrowings`） |
| NFO（淨金融負債） | `有息負債 − 現金及約當現金` | `roic/` 已經算過同樣的東西 |
| FLEV（財務槓桿） | `NFO / 權益` | 純資產負債表時點快照，單季/TTM 共用同一個值，是原始比率（倍數），跟 `dupont` 的 `equityMultiplier` 同一種道理 |
| NBC（淨借貸利率） | `稅後淨利息費用 / NFO` | **不是**直接拿稅前的 `financeCosts` 除以 NFO——要做兩件事才能讓 `ROE = RNOA + FLEV x SPREAD` 這個恆等式對得起來：(1) 淨額，`financeCosts - interestIncome`（NFO 本身是淨額，現金賺的利息收入要算進同一個「金融活動」損益，不能只算負債那一邊）；(2) 用跟 NOPAT 一樣的有效稅率把稅盾效果扣掉 |
| SPREAD | `RNOA - NBC` | |

**唯一要先拍板的邊角案例**（已拍板）：`preferredStockLiability`（分類為負債的可贖回特別股）本質上比較像融資工具，嚴謹一點該算進金融負債，但這個欄位目前只有 5 家金控/保險股有值，決定先不處理，跟 `deRatio`/`roic` 現有「有息負債」定義保持一致，避免為了邊角案例讓公式複雜化。

**交叉驗證發現的真實限制**：`reconstructedRoeQuarterlyPct`/`reconstructedRoeTtmPct`（用 `RNOA + FLEV x SPREAD` 重組出來的 ROE）對照 `actualRoeQuarterlyPct`/`actualRoeTtmPct`（`roe/` 直接算出來的），實測 2330 115Q2：重組 TTM ROE 33.83% vs 實際 TTM ROE 34.78%，差距比 `dupont` 的交叉驗證略大——原因不是算錯，是這個模型把「營業 vs 融資」簡化成兩分法，沒有拆出權益法投資收益、處分利益、匯兌損益這類其他非營業項目（實測發現台積電這類非利息的非營業收支規模不小，遠大於利息收支淨額）。修過一輪：NBC 原本直接用毛的 `financeCosts`，重組 ROE 跟實際 ROE 差距高達 ~11%；改成「淨利息費用扣掉利息收入、再稅後化」之後差距收斂到 TTM ~3%（單季因為分母本身較小，相對誤差會被放大，跟 `dupont` 踩過的坑一樣）——這是模型本身簡化程度的問題，不會再進一步處理（要更精確就要逐科目拆權益法投資收益等項目算進金融/營業，那已經不是「拍板一個定義」能解決的事，是另一個規模的工程）。

## Zmijewski_Score 計算口徑（2026-08-30 實作）

Mark Zmijewski（1984）提出的財務危機 Probit 預警模型：

```
X = -4.3 - 4.5*(淨利 TTM/總資產) + 5.7*(總負債/總資產) - 0.004*(流動資產/流動負債)
```

三個變數都是財報衍生比率：淨利用 TTM（跟 ROE/ROA 的 TTM 邏輯一致，Zmijewski 原始模型是年度財報校準的，TTM 是最接近的替代口徑），總資產/總負債/流動資產/流動負債用本季期末資產負債表數字。`probabilityOfDistress = Φ(X)`（標準常態累積分布函數，用 Abramowitz & Stegun 近似公式，不需要額外統計函式庫），比單看沒有直覺單位的 X 好解讀；`flagged`（`probabilityOfDistress > 0.5`，等同 `xScore > 0`）是原始論文定的門檻。

實測台積電（2330）115Q2 合併報表：X = -3.6198，`probabilityOfDistress` ≈ 0.0001，`flagged: false`——財務體質極佳的公司財務危機機率極低，符合預期。用 2887（台新新光金，金控業）驗證：資產負債表沒有流動資產/流動負債欄位（金融業結構性不分類），`xScore` 正確優雅降級成 `null`，不是丟例外。

**已知限制**：模型係數是用 1970~80 年代美國上市公司資料校準的，套用到台股時絕對數值的校準基準已經過時且跨國/跨幣別，`probabilityOfDistress` 的絕對值不宜直接當成真實違約機率，比較適合當作同一套公司隨時間變化的相對趨勢指標，跟 `Altman_Z_Score`/`Beneish_M_Score` 的已知限制是同一種性質。

## Ohlson_O_Score 計算口徑（2026-08-30 實作）

James Ohlson（1980）提出的財務危機 Logit 預警模型：

```
O = -1.32 - 0.407*SIZE + 6.03*TLTA - 1.43*WCTA + 0.0757*CLCA - 1.72*OENEG
    - 2.37*NITA - 1.83*FUTL + 0.285*INTWO - 0.521*CHIN
```

| 變數 | 公式 | 說明 |
|---|---|---|
| SIZE | `ln(總資產)` | 原始論文用 GNP 物價指數平減過的資產（換算成 1968 年美元）——本服務沒有對應的平減資料源，也沒有正確的美元/年代校準基準可以換算，直接用未平減的原始總資產（千元台幣），見下方已知限制 |
| TLTA | `總負債 / 總資產` | 純資產負債表時點快照 |
| WCTA | `(流動資產 - 流動負債) / 總資產` | 跟 `Altman_Z_Score` 的 X1 分子同一個算法（營運資金），分母不同（X1 除總資產，這裡也是除總資產，其實完全一樣） |
| CLCA | `流動負債 / 流動資產` | |
| OENEG | 總負債 > 總資產記 1，否則記 0 | 權益為負的訊號 |
| NITA | `淨利（TTM） / 總資產` | |
| FUTL | `營運現金流（TTM） / 總負債` | FFO（Funds From Operations）財報沒有現成欄位，用營運現金流（`netCashFromOperatingActivities`）當代理變數——常見的實務替代做法，跟 Beneish AQI 省略證券項、DEPI 只用 depreciation 是同一種「用現有欄位近似原始定義」的簡化 |
| INTWO | 今年、去年 TTM 淨利都是負數記 1，否則記 0 | 「去年」是用 `getPastNQuarters` 往前推 5 季（含本季）取最舊那一筆定位「去年同季」，再往前抓 4 季加總，跟 Piotroski/Beneish 定位「去年同季」同一個 helper、同一種用法 |
| CHIN | `(今年 TTM 淨利 - 去年 TTM 淨利) / (\|今年\| + \|去年\|)` | |

`probabilityOfBankruptcy = 1 / (1 + e^(-O))`，Logit 模型的標準機率轉換；`flagged`（`probabilityOfBankruptcy > 0.5`，等同 `oScore > 0`）是原始論文定的門檻。

實測台積電（2330）115Q2 合併報表：SIZE=22.9614、TLTA=0.3094、WCTA=0.2888、CLCA=0.4069、OENEG=0、NITA=0.2386、FUTL=0.9081、INTWO=0、CHIN=0.2103，O-Score = -11.5187，`probabilityOfBankruptcy` ≈ 0，`flagged: false`——跟 Zmijewski Score 同一個結論。用 2887（台新新光金，金控業）驗證：WCTA/CLCA 因為流動資產/流動負債結構性為 null 而優雅降級成 `null`，導致整體 `oScore` 也是 `null`，但不依賴流動資產/負債的其他 7 個變數（SIZE/TLTA/OENEG/NITA/FUTL/INTWO/CHIN）照常算得出來，不會被拖累——這是刻意設計，讓使用者就算拿不到總分，也能看到個別變數的資訊。

**已知限制**：SIZE 這個變數的絕對尺度已經跟原始校準基準（1970 年代美元、GNP 物價指數平減）完全不同，幣別、年代、有沒有平減都不一樣，`probabilityOfBankruptcy` 的絕對值不宜直接當成真實違約機率，比較適合當作同一套公司隨時間變化的相對趨勢指標，跟 `Altman_Z_Score`/`Beneish_M_Score`/`Zmijewski_Score` 的已知限制是同一種性質。

## 為什麼不做 Greenwald_EPV（2026-08-28 決定移除）

2026-08-25 列入評估，一路解到只剩最後一塊：常態化營業利潤、Beta（2330 限定）、無風險利率（2026-08-28 接上 GOV 解決）、市場風險溢酬都有資料源或可行的代理算法，WACC 算得出來——但 Greenwald 完整三段式輸出（Asset Value / EPV / Franchise Value）裡的 **Asset Value（資產重置成本）** 沒有辦法用忠於資料的方式算：

- **嚴謹版**（Greenwald 原始定義：存貨用重置成本、PP&E 用通膨調整後重置成本、歷年 SG&A/研發費用資本化估帳外無形資產）需要產業別重置成本指數、資產鑑價資料、至少 10~20 年的歷史費用序列——這些不是「查得到查不到」的問題，是本服務資料來源架構完全不涵蓋的維度，接再多資料庫也不會解決。
- **簡化版**（`Asset Value ≈ 總資產 − 總負債`，即帳面權益）雖然算得出來，但本質上是拿 BVPS 冒充資產重置成本，跟真正的 Greenwald 護城河判斷邏輯已經不是同一件事，容易誤導使用者。

2026-08-28 討論後決定：**不用不忠於原始定義的簡化版硬做，整個指標移除**，`guru` 分類只保留能用可靠資料完整算出來的指標。GOV 的無風險利率資料源（`MonthlyGovBondYield10y`，見 [`../../../shared/sourceData/riskFreeRate.ts`](../../../shared/sourceData/riskFreeRate.ts)）不隨這個決定移除——它是通用的資料維度，`macro` 分類的 `YTM` 未來仍然用得到，見 [`../macro/README.md`](../macro/README.md)。
