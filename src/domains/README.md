# 投資量化分析架構（investment_metrics_taxonomy v3.0）

`src/domains` 底下的資料夾對應這份分類，每一類各自的 `README.md` 記錄該分類的範疇、描述，以及分類下每個指標的公式、支援口徑、說明——包含**已實作**跟**尚未實作**的。尚未實作的分類目前只有 `README.md`，沒有 `types.ts`/`service.ts` 之類的程式碼。

## 分類索引

| 資料夾 | 中文名稱 | scope | 狀態 |
|---|---|---|---|
| [`profitability/`](profitability/README.md) | 獲利能力與資本配置效率 | Security | 部分實作（ROE、ROA、ROIC、ROCE、EPS、BVPS、每股營收、毛利率/營業利益率/稅後淨利率、配息率、SGR、杜邦分析法——2026-08-27 新增，自行歸類非 guru；只剩 CFROI） |
| [`turnover/`](turnover/README.md) | 營運週轉與資產效率 | Security | 全部完成（存貨/應收帳款/應付帳款/總資產/固定資產周轉率、DIO/DSO/DPO/CCC、資本支出佔營收比） |
| [`solvency/`](solvency/README.md) | 財務結構、償債安全與破產預警 | Security | 全部完成（負債比率、流動/速動/現金比率、負債權益比、利息保障倍數、淨負債對 EBITDA 比）；`Altman_Z_Score` 2026-08-24 改歸類到 `guru/` |
| [`cashFlow/`](cashFlow/README.md) | 現金流品質與法證會計防雷 | Security | 部分實作（每股 OCF/FCF、OCF 對淨利比、應計項目比率；只剩 FCF_Yield，需股價）；`Beneish_M_Score` 2026-08-25 改歸類到 `guru/` |
| [`valuation/`](valuation/README.md) | 估值與市場定價指標 | Security | 部分實作（PER、PBR、Dividend_Yield，直接採用 oingg-twse 現成數字；PSR/P_FCF/EV_EBITDA 所需市值資料源已接上，待實作） |
| [`guru/`](guru/README.md) | 大師策略與複合量化估值模型 | Security | 部分實作（葛拉漢數——本服務第一個複合指標；`Graham_NCAV`；`Buffett_Owner_Earnings`——每股版本；`Altman_Z_Score`——2026-08-24 從 `solvency/` 移入，2026-08-27 實作；`Piotroski_F_Score`；`Beneish_M_Score`——2026-08-25 從 `cashFlow/` 移入，2026-08-27 實作）；`Nissim_Penman_RNOA`（2026-08-25 新列入，自行歸類）還沒做，只差定義決策要拍板，不缺資料；`Greenwald_EPV` 2026-08-25 曾列入，2026-08-28 因為資產重置成本無法忠於資料計算，決定移除 |
| [`technicals/`](technicals/README.md) | 技術分析與價格量能指標 | Security | 未實作——2026-08-28 查證：oingg-twse `daily_price` 現在有 1378 檔股票、約 58 個交易日（2026-06-01~2026-08-21），不再是早期文件寫的「只有 2 天」；足夠做 5D~60D 短週期指標，120D/200D 均線仍不夠長，見該分類 README |
| [`portfolio/`](portfolio/README.md) | 投資組合風險、超額報酬與量化因子 | Portfolio | 部分實作（`Beta`，2026-08-26，見該分類 README「為什麼 Beta 是例外」）；其餘指標需要「投資組合」這個資料模型，目前只有單一公司查詢 |
| [`macro/`](macro/README.md) | 總體經濟、固定收益與市場情緒 | Market_Macro | 未實作——需要總體經濟/債券/選擇權資料源，跟公司財報完全無關 |
| [`securityInfo/`](securityInfo/README.md) | 證券基本資訊 | Security | 未實作——見下方「第二套分類方案」 |
| [`marketData/`](marketData/README.md) | 市場行情數據 | Security | 未實作——見下方「第二套分類方案」 |
| [`financials/`](financials/README.md) | 財務報表 | Security | 未實作——見下方「第二套分類方案」 |
| [`growth/`](growth/README.md) | 成長性指標 | Security | 未實作——見下方「第二套分類方案」 |

## 跨分類的時間轉換算子（temporal_transformation_operators）

這三個不是分類，是**可以套用在多個分類指標上的計算算子**，taxonomy 裡獨立列出：

| 算子 | 中文名稱 | 支援窗口 | 公式 |
|---|---|---|---|
| `CAGR` | 年複合成長率算子 | 3Y / 5Y / 10Y | `(Value_end / Value_start) ^ (1/n) - 1` |
| `PoP_Growth` | 週期變動率算子 | YoY / QoQ / MoM | `(Value_current - Value_prior) / Value_prior * 100%` |
| `Rolling_Average` | 滾動平滑算子 | 1Y/3Y/10Y Rolling | `Mean(Value, Window_N)` |

本服務目前的指標都是「單季 / 單季年化（簡單 x4） / TTM」，還沒有套用 CAGR、真正的 Rolling Average 這類跨年度算子——這些算子哪天要用，會是在既有分類的指標上疊加，不會自己形成新的分類資料夾。

## 跟既有指標的對應說明（現況 vs 理想 taxonomy）

taxonomy 是理想化的分類文件，已實作指標裡有 2 個（BVPS、每股營收）不是 taxonomy 明列的獨立 code，是因為跟 EPS 同屬「每股基礎財務數字」家族，被放進 `profitability`——各分類 README 裡有標注哪些是「taxonomy 明列」、哪些是「本服務自行歸類」，也有標注哪些指標的公式跟 taxonomy 原文有差異（例如用期末值取代平均值、用有息負債取代總負債）。詳細的已實作/未實作清單、公式、口徑差異都在各分類自己的 README，這裡不重複列，只維護分類層級的總覽。

## 第二套分類方案（8 類 + 大師策略，評估中）

2026-08-24 討論過一套不同的分類軸線（`securityInfo`／`marketData`／`technicals`／`financials`／`valuation`／`growth`／`marginsAndRatios`／`dividends`，共 8 類，加上保留現有的 `guru` 大師策略），跟這份文件的 investment_metrics_taxonomy v3.0 是**兩套不同的切分邏輯**——v3.0 照「分析目的/方法論」切（獲利能力、償債能力、現金流品質⋯⋯），第二套照「資料型態」切（原始資訊 vs 市場數據 vs 計算出來的比率⋯⋯），不是誰取代誰，是還沒拍板要不要換。

拆成兩種改動，分開處理：

- **既有 21 支指標重新分組**：`marginsAndRatios` 會吃掉現有 `profitability`/`solvency`/`turnover`/`cashFlow` 四個資料夾的比率類指標；`dividends` 要從 `profitability`（配息率/SGR）跟 `valuation/marketRatios`（殖利率，目前跟 PER/PBR 同一支 API）拆出來。folder 搬動本身機制不難（相對 import 深度不變），但 `marketRatios` 那支 API 要不要真的拆表/拆 API，還是只在 `filterCatalog.ts` 讓同一個底層欄位掛兩個分類，**還沒決定，先不動**。
- **全新的空分類先建骨架**：`securityInfo`、`marketData`、`financials`、`growth` 這四類目前完全沒有對應的程式碼（`technicals` 沿用原本的 `technical/`，只是改名跟第二套方案的 id 對齊），跟 `portfolio`/`macro` 一樣「有骨架沒程式碼」——只有 `README.md` 記錄範疇跟已知會用到的資料來源，`要不要真的動工再個別討論`，這裡不重複列規劃過程，各自的 `README.md` 有寫。原始分類表只給了每類的項目數量（26/37/47/9），沒有給到逐項清單，所以這四份 `README.md` 沒有像 `technical/`/`portfolio/`/`macro/` 那樣列出完整的「指標清單」表格，只列已知能對到的真實資料來源。
