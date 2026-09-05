# 投資量化分析架構（investment_metrics_taxonomy v3.0）

`src/domainMetrics` 底下每個指標一個檔案，對應這份分類。分類層級的詳細說明（範疇、公式、支援口徑）2026-09-05 起不再各自維護一份 `.md` 文件——指標數量持續成長，分開維護的文件很快就跟實作脫節，改成統一以 `filterCatalog.csv` 當分類/指標層級的唯一真理來源，指標特有的計算口徑說明直接寫在各自檔案的程式碼註解裡。

**2026-09-05 兩個結構調整**：`technicals` 分類（ma/rsi/kd/bollingerBands/atr/bias/macd/obv，
8 支指標）使用者決定刪除，已從索引移除；`macro` 分類（跟單一公司財報完全無關，是全市場單一值）
拉出去成獨立的頂層 `domainMacro/`，不再是這份 taxonomy 底下的分類，見
[`../domainMacro/README.md`](../domainMacro/README.md)。

## 分類索引

分類層級的詳細說明已不再各自維護 `.md` 文件（見上方 2026-09-05 的說明），這裡只維護最精簡的總覽，詳細的分類/指標中英文名稱、描述見 [`../api/bff/filter/filterCatalog.csv`](../api/bff/filter/filterCatalog.csv)。

| 分類 | 中文名稱 | scope | 狀態 |
|---|---|---|---|
| `profitability` | 獲利能力與資本配置效率 | Security | 全數實作（ROE、ROA、ROIC、ROCE、EPS、BVPS、每股營收、毛利率/營業利益率/稅後淨利率、配息率、SGR、杜邦分析法——2026-08-27 新增，自行歸類非 guru；`CFROI` 2026-08-30 決定移除） |
| `turnover` | 營運週轉與資產效率 | Security | 全部完成（存貨/應收帳款/應付帳款/總資產/固定資產周轉率、DIO/DSO/DPO/CCC、資本支出佔營收比） |
| `resilience` | 財務結構、償債安全與破產預警 | Security | 全部完成（負債比率、流動/速動/現金比率、負債權益比、利息保障倍數、淨負債對 EBITDA 比）；`Altman_Z_Score` 2026-08-24 改歸類到 `guru`；2026-09-02 盤點存股需求，銀行業專屬指標（CAR/CET1/NPL/備抵呆帳覆蓋率）排入未來規劃，卡在需要新資料源 |
| `cashFlow` | 現金流品質與法證會計防雷 | Security | 全數實作（每股 OCF/FCF、OCF 對淨利比、應計項目比率、FCF_Yield——2026-08-30 股價來源解禁後補上最後一個）；`Beneish_M_Score` 2026-08-25 改歸類到 `guru` |
| `valuation` | 估值與市場定價指標 | Security | 部分實作（PER、PBR、Dividend_Yield 直接採用 oingg-twse 現成數字；PSR、P_FCF、EV_EBITDA 2026-08-30 實作完成）；2026-09-02 盤點存股需求，歷史平均殖利率、估值定價帶模型排入未來規劃 |
| `guru` | 大師策略與複合量化估值模型 | Security | 部分實作（葛拉漢數——本服務第一個複合指標；`Graham_NCAV`；`Buffett_Owner_Earnings`——每股版本；`Altman_Z_Score`——2026-08-24 從 `resilience` 移入，2026-08-27 實作；`Piotroski_F_Score`；`Beneish_M_Score`——2026-08-25 從 `cashFlow` 移入，2026-08-27 實作；`Nissim_Penman_RNOA`——2026-08-25 新列入，2026-08-28 實作；Zmijewski Score、Ohlson O-Score——2026-08-30 新列入並實作，兩者都是財務危機預警模型，跟 `Altman_Z_Score` 同一種資料需求）；`Greenwald_EPV` 2026-08-25 曾列入，2026-08-28 因為資產重置成本無法忠於資料計算，決定移除 |
| `portfolio` | 投資組合風險、超額報酬與量化因子 | Portfolio | 部分實作（`Beta`，2026-08-26）；其餘指標需要「投資組合」這個資料模型，目前只有單一公司查詢 |
| `growth` | 成長性指標 | Security | 未實作——見下方「第二套分類方案」；2026-09-02 盤點存股需求，EPS CAGR、連續配發股利年數、ROE 歷史一致性檢驗排入未來規劃 |

## 跨分類的時間轉換算子（temporal_transformation_operators）

這三個不是分類，是**可以套用在多個分類指標上的計算算子**，taxonomy 裡獨立列出：

| 算子 | 中文名稱 | 支援窗口 | 公式 |
|---|---|---|---|
| `CAGR` | 年複合成長率算子 | 3Y / 5Y / 10Y | `(Value_end / Value_start) ^ (1/n) - 1` |
| `PoP_Growth` | 週期變動率算子 | YoY / QoQ / MoM | `(Value_current - Value_prior) / Value_prior * 100%` |
| `Rolling_Average` | 滾動平滑算子 | 1Y/3Y/10Y Rolling | `Mean(Value, Window_N)` |

本服務目前的指標都是「單季 / 單季年化（簡單 x4） / TTM」，還沒有套用 CAGR、真正的 Rolling Average 這類跨年度算子——這些算子哪天要用，會是在既有分類的指標上疊加，不會自己形成新的分類資料夾。

## 跨分類的查詢慣例：year/season 選填、自動抓最新一季（2026-08-28）

`profitability`/`cashFlow`/`resilience`/`turnover`/`guru` 五個分類幾乎所有指標，`year`/`season` 現在都是選填（要嘛都給要嘛都不給，只給其中一個是 400），不給就自動抓「這支指標實際需要的所有財報表都有資料」的最新一季——不是任一張表自己的最新一季。動機跟細節見根目錄 [`../../../README.md`](../../../README.md) 的「year/season 選填、自動抓最新一季的設計」，共用邏輯在 [`../../shared/sourceData/latestQuarter.ts`](../../shared/sourceData/latestQuarter.ts)。這裡不重複整套說明，只提醒：之後新增指標時，如果查的是季度財報資料，應該照這個慣例做，不要走回「year/season 必填」的舊模板。

## 跨分類的 coding convention：`filterCatalog.ts` 的 `name` 不能放實作細節（2026-08-28）

[`../filter/filterCatalog.ts`](../filter/filterCatalog.ts) 裡每個分類/指標/欄位的 `name` 是**直接顯示給前端使用者看的文案**，不是給開發者看的內部備註。踩過一次：`dupont`/`nissimPenmanRnoa` 的 `actualRoe*` 欄位（直接引用 `roe/` 算出來的數字，用來對照拆解得準不準）一開始把 `name` 寫成「實際 ROE（單季，引用自 roe/）」，把「這個欄位怎麼實作出來的」這種開發者才需要的細節混進使用者會看到的標籤，甚至直接洩漏了 `roe/` 這種內部資料夾路徑。

**規則**：任何「這個欄位是怎麼算出來的」「引用了哪個服務」這類實作細節，一律寫成程式碼註解（放在該欄位定義的上一行），`name` 只放使用者理解這個數字需要的資訊。新增/修改 `name` 前自問：這句話前端使用者看得懂、也需要知道嗎？如果答案是「這是講給下一個維護程式碼的人聽的」，就不該出現在 `name` 裡，該寫成註解。這個規則不只限於 `filterCatalog.ts`——任何會被序列化進 API 回應、直接呈現給使用者的字串欄位（不是 `warnings`/`fieldStatuses.message` 這種明確定位是「給人看的除錯訊息」的欄位）都適用同一個判斷標準。

**另一條相關但獨立的規則：`name` 要簡短但識別力強，不要附加對識別沒有幫助的說明子句。** 踩過一次：`dupont` 的 `name` 一開始寫成「杜邦分析（3 步拆解 ROE）」——「3 步拆解 ROE」講的是內部計算方法有幾個步驟，不是在幫使用者從一堆指標裡認出「這是哪一個」，「杜邦分析」四個字本身就已經是足夠識別的名稱，加這段子句只是多餘的標點跟文字，對識別沒有貢獻，改成「杜邦分析」即可。判斷標準：括號裡加的內容如果是「這是什麼的別名/英文原名」（例如「每股盈餘（EPS）」「奧特曼 Z 分數（Altman Z-Score）」）或「這是哪一種版本/口徑」（例如「原始版」區分還沒做的 Z''-Score 版本、「每股」區分 taxonomy 原本定義的公司總額版本），就是在幫助識別，可以留；如果只是換句話說明算法內部怎麼跑（例如「3 步拆解」「加總近四季」這類計算過程敘述），就該整段拿掉，那是文件/註解該講的事，不是名稱該扛的責任。

**第三條規則，2026-08-28 全面套用到 `filterCatalog.ts`：`name` 永遠不能出現標點符號，也不能放 period 資訊。**

- **不能有標點符號**：括號、逗號、頓號、斜線全部不行——多個詞要並列時用空白字元分隔（空白不算標點符號）。例如「毛利率／營業利益率／稅後淨利率」改成「毛利率 營業利益率 稅後淨利率」；「每股盈餘（EPS）」改成「每股盈餘 EPS」。唯一的例外是人名/專有名詞本身固有拼寫裡的連字號（`Z-Score`、`F-Score`、`M-Score`）——那是拼寫的一部分，拿掉反而變成拼錯，不算違規。
- **不能放 period 資訊**：不要出現「單季」「TTM」「單季年化」這類字樣——`FilterField.period` 已經是結構化欄位，帶著同一份資訊，重複寫進 `name` 字串等於同一份資料存兩份，而且格式（要顯示成「淨利率（TTM）」還是「淨利率 · TTM」還是別的樣式）是前端的決定，不該由後端把格式化結果算好塞給前端。實務上這代表同一個指標底下，單季/年化/TTM 三個 field 現在會共用同一個 `name` 字串（例如 `roeQuarterlyPct`/`roeQuarterlyAnnualizedPct`/`roeTtmPct` 的 `name` 都是「ROE」）——這是預期行為，不是漏改，前端要靠 `key` 分辨是哪個 field、靠 `period` 分辨是哪個口徑，`name` 只負責回答「這是什麼」，不負責「這是哪個版本」。
- **跟第二條規則怎麼並存**：`Beta` 的 `beta1Y`/`beta2Y`/`beta5Y` 三個 field 的 `period` 分別是 `'daily'`/`'weekly'`/`'monthly'`（1Y 用日資料、2Y 用週資料對齊 Bloomberg、5Y 用月資料對齊 Yahoo Finance，見 [`beta.ts`](beta.ts)）——但 `period` 描述的是**取樣頻率**，不是**回看窗口長度**，這是兩個不同維度，只是在 Beta 這個指標裡剛好一一對應（daily↔1年、weekly↔2年、monthly↔5年），不代表窗口長度可以從 `period` 反推：拿掉「1 年」「2 年」「5 年」，前端要嘛得額外知道「weekly 就是指 2 年」這種隱性對應規則，要嘛就真的分不出這三個 field 代表哪個窗口。判斷標準是「這個字樣描述的維度，是不是已經有別的結構化欄位在帶」：`period` 欄位存在就不要重複寫進 `name`（這是 2026-08-28 第一次修的問題：一開始誤以為 `beta1Y`/`beta2Y`/`beta5Y` 的 `period` 全部是 `daily`，後來發現實際上分成三種取樣頻率，這條反而變成前面第一次修正時判斷錯誤的示範）；`period` 沒有帶到、且拿掉會讓不同 field 的 `name` 撞在一起變得無法識別的維度（例如窗口長度），才留在 `name` 裡（拿掉標點但保留文字：「Beta 1 年」）。

**第四條規則，2026-08-30：`FilterCategory.name`（大分類名稱）限制在 5 個中文字以內。** 踩過一次：一開始直接沿用 taxonomy 的正式分類描述當 `name`（例如「估值與市場定價指標」9 個字、「大師策略與複合量化估值模型」12 個字），對「識別這是哪個分類」沒有額外幫助，純粹是字數多。改成 4 個字的簡稱：`profitability`→「獲利能力」、`cashFlow`→「現金流量」、`resilience`→「韌性」（2026-09-05 使用者要求從「償債能力」改名）、`turnover`→「營運週轉」、`valuation`→「估值指標」、`guru`→「大師指標」、`portfolio`→「投資組合」。taxonomy 的完整分類描述留在各分類自己的 `README.md` 開頭（那裡要精確、正式；`filterCatalog.ts` 的 `name` 要短、給使用者一眼認出來），兩者不用是同一個字串。`FilterMetric`/`FilterField` 的 `name` 沒有這條「5 個字」的硬性上限（複合指標名稱本來就比較長），但一樣要遵守前面「簡短但識別力強」的精神，不要無限制加長——**2026-08-30 追加一條**：學者人名音譯（葛拉漢、奧特曼、皮爾托斯基、貝尼許）跟對應的字母代號中文翻譯（F 分數、M 分數、Z 分數）本身沒有獨立會計意義，一律拿掉只用英文（`Graham Number`、`Piotroski F-Score`），跟真正有會計意義的中文翻譯（`淨流動資產價值`／NCAV、`貝塔係數`／Beta）分開處理，細節見 `filterCatalog.ts` 開頭註解。

**第五條規則，2026-08-30：一個 API/model 底下概念上不同的欄位群組，要拆成多個 `FilterMetric` 顯示分組，不要硬湊成一個 `name` 又臭又長的 metric。** 踩過一次：`turnover/turnoverRatio` 這支 API 一次算存貨/應收帳款/總資產/固定資產/應付帳款周轉率，加上 DIO/DSO/DPO/CCC 四個週轉天數/週期指標，共 9 組概念、22 個欄位，一開始全部塞進一個 `FilterMetric`，`name` 被迫寫成「存貨周轉率 應收帳款周轉率 總資產周轉率 固定資產周轉率」這種列不完、看不出全貌的字串（連應付帳款周轉率跟 DIO/DSO/DPO/CCC 都沒提到）。

**規則**：這種情況要拆成多個 `FilterMetric`，各自一個乾淨的 `name`（例如「存貨周轉率」「DIO 存貨週轉天數」），`path` 照樣填同一支 API 路徑，額外填 `modelKey`（統一寫這個 model 對應的原始 metric key，例如 `'turnoverRatio'`）告訴一致性檢查「這幾個顯示分組其實是同一個 model 拆出來的」。`filterCatalogCheck.ts` 的比對邏輯已經支援這件事：同一個 `modelKey` 底下所有顯示分組的 `fields` 取聯集，只要聯集蓋滿該 model 的全部 Decimal 欄位就算一致，不要求每個顯示分組自己就是完整的 model。判斷時機：一個 API 回傳的欄位如果能明顯分成好幾組「各自代表不同概念、各自的單季/年化/TTM 是同一組」的子集，就該拆；如果只是同一個比率的單季/年化/TTM 三個口徑，那不算，維持一個 metric 就好（那三個本來就是同一件事的不同口徑，不是不同概念）。

## 跟既有指標的對應說明（現況 vs 理想 taxonomy）

taxonomy 是理想化的分類文件，已實作指標裡有 2 個（BVPS、每股營收）不是 taxonomy 明列的獨立 code，是因為跟 EPS 同屬「每股基礎財務數字」家族，被放進 `profitability`。哪些指標是「taxonomy 明列」、哪些是「本服務自行歸類」，哪些指標的公式跟 taxonomy 原文有差異（例如用期末值取代平均值、用有息負債取代總負債），這些細節 2026-09-05 起改成寫在各指標自己檔案的程式碼註解裡，不再維護獨立的分類文件。

## 第二套分類方案（8 類 + 大師策略，評估中）

2026-08-24 討論過一套不同的分類軸線（`securityInfo`／`marketData`／`technicals`／`financials`／`valuation`／`growth`／`marginsAndRatios`／`dividends`，共 8 類，加上保留現有的 `guru` 大師策略），跟這份文件的 investment_metrics_taxonomy v3.0 是**兩套不同的切分邏輯**——v3.0 照「分析目的/方法論」切（獲利能力、償債能力、現金流品質⋯⋯），第二套照「資料型態」切（原始資訊 vs 市場數據 vs 計算出來的比率⋯⋯），不是誰取代誰，是還沒拍板要不要換。

拆成兩種改動，分開處理：

- **既有 21 支指標重新分組**：`marginsAndRatios` 會吃掉現有 `profitability`/`resilience`/`turnover`/`cashFlow` 四個資料夾的比率類指標；`dividends` 要從 `profitability`（配息率/SGR）跟 `valuation/marketRatios`（殖利率，目前跟 PER/PBR 同一支 API）拆出來。folder 搬動本身機制不難（相對 import 深度不變），但 `marketRatios` 那支 API 要不要真的拆表/拆 API，還是只在 `filterCatalog.ts` 讓同一個底層欄位掛兩個分類，**還沒決定，先不動**。
- **全新的空分類先建骨架**：`growth` 這類目前完全沒有對應的程式碼，跟 `portfolio` 一樣「有骨架沒程式碼」，`要不要真的動工再個別討論`，這裡不重複列規劃過程。原始分類表只給了每類的項目數量，沒有給到逐項清單，指標清單/已知能對到的真實資料來源這些細節不在這裡重複維護。（`technicals` 已刪除、`macro` 已拉出去成獨立的 `domainMacro/`，見檔案開頭 2026-09-05 的說明，不再是這份文件討論的對象。）
  **2026-09-05：`marketData`（市場行情數據）、`financials`（財務報表）這兩個原本一起規劃的空分類骨架已經刪除**——使用者決定不做，`growth` 保留。

**`securityInfo` 2026-09-02 從這份骨架清單移除**：原本規劃的範疇（公司基本資料——名稱、產業、上市日期、股本結構、經營層⋯⋯）已經不是「指標分類」的問題，是「查詢主體是公司還是證券」這個更根本的路由設計問題——實際做出來變成 `GET /companies/profile`（`src/api/bff/companies/`），跟真正上市櫃的證券範圍另外切開一支 `GET /securities/symbols`（`src/api/bff/securities/`，2026-09-04 已刪除，使用者確認即使 mops-ts 有在用也一併砍掉），不是掛在這份 metrics taxonomy 底下的分類，這裡不再保留這個骨架條目，避免跟真正的實作出現兩份互相不同步的規劃。
