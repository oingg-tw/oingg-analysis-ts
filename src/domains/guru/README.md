# 大師策略與複合量化估值模型（guru_and_composite_valuation_models）

- **scope**：Security
- **說明**：整合經典大師選股準則、動態成長折現與多因子基本面評分模型。
- **狀態**：部分實作（`Graham_NCAV`、`Buffett_Owner_Earnings`、葛拉漢數——最後者是本服務自行歸類的指標，見下方）。

## 為什麼其他 taxonomy 明列的指標還沒做

這類指標是組合多個基礎指標、通常還要加市場價格或成長率假設的「大師公式」，帶有特定投資人流派的主觀判斷，跟其他分類「直接從財報算出來的數字」性質不同。`Greenblatt_Magic_Formula`、`Lynch_PEG_Fair_Value`、`Potential_Payback_Period` 需要股價/市值——[`../valuation/`](../valuation/README.md) 已經接上 oingg-twse 的股價資料源，理論上可以做了，但 `Lynch_PEG_Fair_Value`、`Potential_Payback_Period` 還需要「預期成長率」這種前瞻性假設（不是資料庫裡現成的欄位，taxonomy 也沒定義怎麼推算），`Greenblatt_Magic_Formula` 則需要跨公司排名（`Rank(...)`），不是本服務目前「查單一公司單一季度」這種查詢介面能直接套的，這兩類都還需要先做架構/口徑決策，不是單純缺資料。`Piotroski_F_Score`、`Mohanram_G_Score` 是多變量組合模型，需要「今年 vs 去年同季」的跨期比較，所需財報欄位都已經有，但目前 18 支 API 都是單季/TTM 查詢，沒有這種跨期比較的查詢模式，是架構上還沒做，不是資料缺漏。

## 指標清單

| code | 中文名稱 | 公式 | supported_periods | 說明 |
|---|---|---|---|---|
| `Graham_NCAV` | 葛拉漢淨流動資產價值 | `(Current Assets - Total Liabilities - Preferred Stock) / Shares` | MRQ, FY | ✅ 已實作 — [`ncav/`](ncav/)，`GET /guru/ncav`。同時回傳安全邊際價（NCAV x 2/3），見下方說明 |
| `Greenblatt_Magic_Formula` | 葛林布雷神奇公式 | `Rank(Earnings Yield = EBIT/EV) + Rank(ROC = EBIT/(Net Working Capital + Net Fixed Assets))` | TTM, FY | ⬜ 未實作。財務數字都已經有（EV = 市值 + 淨負債，市值/淨負債都已經算過），卡在「跨公司排名」不是單一公司查詢，需要新的查詢介面 |
| `Lynch_PEG_Fair_Value` | 彼得林區本益成長模型 | `PEG = PER / Expected Growth Rate; Fair Value = Expected Growth Rate * EPS` | Forward, TTM | ⬜ 未實作，需要「預期成長率」這種前瞻性假設，資料庫沒有現成欄位 |
| `Buffett_Owner_Earnings` | 巴菲特股東盈餘 | `Net Income + D&A - Maintenance CapEx` | TTM, FY | ✅ 已實作（每股版本） — [`ownerEarnings/`](ownerEarnings/)，`GET /guru/owner-earnings`（單季/年化/TTM）。taxonomy 是公司總額，本服務改成每股版本，見下方說明 |
| `Piotroski_F_Score` | 皮爾托斯基分數 | 9 項基本面二元會計訊號加總（0~9） | TTM, FY | 綜合獲利能力、財務槓桿/流動性及營運效率改善之 9 分制質量評分 |
| `Mohanram_G_Score` | 莫罕拉姆 G 分數 | 8 項基本面成長/研發效率訊號加總（0~8） | TTM, FY | 針對高估值與高成長標的設計的基本面評分，彌補 F-Score 偏重價值股的限制 |
| `Potential_Payback_Period` | 潛在回本期模型 | `ln(1 + (Stock Price * ln(1 + g)) / EPS_0) / ln(1 + g)` | Forward_3Y, Forward_5Y | 考量獲利複合成長率下，動態推算收回購股成本所需的真實年數 |

## 本服務自行歸類的指標（不在 taxonomy 明列的 code 裡）

| 指標 | 公式 | 狀態 |
|---|---|---|
| 葛拉漢數（Graham Number） | `sqrt(22.5 x EPS(TTM) x BVPS)` | ✅ 已實作 — [`grahamNumber/`](grahamNumber/)，`GET /guru/graham-number` |

taxonomy 列的是 `Graham_NCAV`（葛拉漢淨流動資產價值），跟這裡的「葛拉漢數」是葛拉漢提出的**兩個不同公式**，taxonomy 沒有把葛拉漢數單獨列出來，但這是一個廣為人知、常被引用的獨立公式，所以自行歸類進來。

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
