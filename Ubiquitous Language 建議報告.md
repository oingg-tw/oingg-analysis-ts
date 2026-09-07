# 金融資料領域「事實標準用語」對照與 Ubiquitous Language 建議報告
（供台灣市場量化/基本面選股平台 DDD 命名規範使用）

## TL;DR
- 學術界（CRSP/Compustat/WRDS/Fama-French）與商業供應商（Bloomberg/LSEG/FactSet）各有一套 mnemonic 傳統，但底層概念高度一致；建議平台採「概念以學術界語意為準、命名以開發者 API 的 lowercase snake_case 為準」的混合策略，並在 domain model 中明確區分 identifier、price、fundamental、point-in-time、chip（籌碼）五大 bounded context。
- 最容易造成 bug 的三個命名陷阱是：(1) `close` vs `last`（收盤 vs 最新成交）、(2) `report_date` 的歧義（fiscal period end 即 CRSP/Compustat 的 `datadate` vs 財報公布日 `rdq`/filing date）、(3) `adjusted` 的多義（split-only vs split+dividend total-return 調整）。這三者必須在 glossary 中以獨立欄位名徹底拆開。
- 台灣特有的「三大法人／融資融券／券資比」等籌碼概念，國際上對應 institutional investors flow / margin trading & short selling / short-to-margin ratio，建議保留本地語意但以標準英文欄位命名，並註記其與美國 13F、FINRA short interest 的制度差異（台灣為每日 T+1 揭露且公開回溯至 2012/04；美國 13F 為季度、季末後 45 天內申報；FINRA short interest 為每月兩次、結算日後第 7 個營業日揭露）。

## Key Findings

### 一、證券識別碼體系（Security Identifiers）
識別碼是整個 security master 的 primary key 設計核心。關鍵在於區分「issuer 層級」「security/issue 層級」「listing/venue 層級」與「隨時間可變 vs 永久不變」。

| 概念 | 學術界 | 供應商/開發者 | 特性與適用場景 |
|---|---|---|---|
| 交易代碼（可重用、會變動） | CRSP `TICKER`；Compustat `tic` | Bloomberg ticker（如 `AAPL US Equity`）；yfinance/Polygon/Tiingo `symbol`/`ticker` | 人類可讀但不唯一；ticker 會被重用（reuse）與變更（symbol change），不可當永久鍵 |
| 永久證券識別（學術） | CRSP `PERMNO`（security）、`PERMCO`（company） | — | CRSP 專有；發行期間不變、退市後不重配，可追蹤整段交易史 |
| 永久公司識別（學術） | Compustat `GVKEY`（+ `IID` 為 issue） | — | Compustat 專有公司鍵；跨檔案一致 |
| 北美證券碼 | CRSP `CUSIP`/`NCUSIP`（historical CUSIP） | 各供應商皆有 | 9 碼；美加專用；SEC EDGAR 使用 |
| 國際證券碼 | ISIN | 各供應商皆有 | 12 碼（國碼+9碼+檢查碼）；歐洲 MiFID II／全球監理報告使用 |
| 英國/歐洲清算碼 | SEDOL | LSEG/Datastream 常用 | 6 碼；倫敦及部分歐洲場所 |
| 開放式全球識別 | 研究界漸增採用 | Bloomberg 發起的 FIGI（OpenFIGI 免費）；LSEG PermID | 見下方詳述 |
| 供應商專有碼 | — | LSEG `RIC`（Reuters Instrument Code，基於 ticker）；Datastream mnemonic/`DSCD`；FactSet 識別；S&P Capital IQ `CIQ`；Bloomberg `BBGID` | RIC 在公司私有化/被併後常失效 |
| 法人實體識別 | — | LEI（20 碼） | 識別「公司實體」而非證券 |

**FIGI 細節（供 security master 設計參考）：** 依 OpenFIGI 官方（openfigi.com/about/overview），FIGI 為 12 碼英數，第 1-2 碼標示發證的 Certified Provider、第 3 碼固定為 `G`、第 4-11 碼為隨機值（不含母音）、第 12 碼為採 Modulus 10 Double Add Double 技術的檢查碼；且「Once a FIGI is assigned, it never changes throughout the trade lifecycle... retired and never reused」（一經指派永不變更、退役後不重用）。標準由 Object Management Group（OMG）治理，Bloomberg L.P. 為 Registration Authority；FIGI 免授權費、可自由儲存與再散布，並有 share-class / composite / venue 三層粒度——這正是「永久 + 免費 + 分層」的理想 canonical 鍵候選。

**核心語意慣例：** 識別碼隨時間變動的處理，學術界的標準做法是用「永久 surrogate key（PERMNO/GVKEY）+ 帶生效期間的識別碼歷史表」。CRSP `NCUSIP` 即「歷史上該時點的 CUSIP」，相對於 `CUSIP`（最新）。這正是 point-in-time identifier 的典範，平台應照抄此模式。

### 二、價格資料（Price Data）
CRSP 的價格慣例是全世界最嚴謹的參考標準：
- `PRC`：收盤價，但**若無成交則存買賣中價並帶負號**（leading dash），使用時須取絕對值 `abs(PRC)`。這是「negative price」陷阱。
- `RET`：holding period return（持有期報酬），**含息**（total return），已對 split/dividend 調整。
- `RETX`：price-only return（除息報酬，不含息）。
- `SHROUT`：流通股數（單位為千股）。
- `CFACPR`：Cumulative Factor to Adjust Price（累計價格調整因子）。
- `CFACSHR`：Cumulative Factor to Adjust Shares（累計股數調整因子）。
- 調整價公式：`adjusted price = abs(PRC) / CFACPR`；調整股數 = `SHROUT * CFACSHR`。兩者「通常」相等，但遇 spin-off、rights 等特殊事件會不同。
- `DLRET`（delisting return）、`DLSTCD`（delisting code）、`DLSTDT`（delisting date）：退市報酬與代碼，避免 survivorship bias 的關鍵。

Compustat 對應的價格調整因子是 `AJEX`/`ADJEX`（Cumulative Adjustment Factor），大部分 Compustat 每股數列都已 split-adjusted。

開發者 API 的 OHLCV 慣例（供 schema 直接參考的精確欄位名）：
- **Polygon.io** Aggregates/Bars 用單字母 JSON key：`o`（open）、`h`（high）、`l`（low）、`c`（close）、`v`（volume）、`vw`（volume weighted average price）、`n`（number of transactions）、`t`（Unix 毫秒 timestamp）、`otc`（是否 OTC；為 false 時省略）。`adjusted=true` 參數控制回傳 split 調整價。（註：`a`/`op` 只出現在 WebSocket 聚合訊息，不在 REST Bars。）
- **Tiingo** EOD 用 camelCase：`date, open, high, low, close, volume, adjOpen, adjHigh, adjLow, adjClose, adjVolume, divCash, splitFactor`（`splitFactor` = splitTo/splitFrom，無分割時為 1.0）。
- **yfinance** `Ticker.history()` DataFrame 用 Title Case 帶空格：`Open, High, Low, Close, Volume, Dividends, Stock Splits`，以及 `Adj Close`（僅 `auto_adjust=False` 時出現；目前版本 `auto_adjust=True` 為預設，會把調整價折進 `Close` 且不回傳 `Adj Close`）。
- **Alpha Vantage** `TIME_SERIES_DAILY_ADJUSTED` 用編號字串 key：`"1. open"、"2. high"、"3. low"、"4. close"、"5. adjusted close"、"6. volume"、"7. dividend amount"、"8. split coefficient"`（值皆為字串）。
- **OpenBB Platform** 標準化資料模型（`EquityHistoricalData`）統一為 lowercase snake_case：`date, open, high, low, close, volume, vwap`，以及 `adj_close`、`transactions`。OpenBB 以 `__alias_dict__` 把各家欄位對齊標準名（例如 Polygon provider：`{date:t, open:o, high:h, low:l, close:c, volume:v, vwap:vw}`）——這是把各供應商欄位對齊的最佳範本。

行情資料時間結構詞：OHLCV（Open/High/Low/Close/Volume）；一根 bar 也稱 candle（K 線）；tick（逐筆）；EOD（end-of-day，日終）；intraday（盤中）。Polygon 把 bar 稱為 aggregate。

### 三、財報資料與會計 mnemonic（Fundamentals）
Compustat mnemonic 是財報欄位的事實標準，annual 檔（`funda`）用基本名、quarterly 檔（`fundq`）加 `q` 後綴：

| 概念 | Annual | Quarterly | 語意 |
|---|---|---|---|
| 公司鍵 | `GVKEY` | `GVKEY` | 永久公司識別 |
| 資料日期（fiscal period end） | `datadate` | `datadate` | 財報年度/季度的**最後一天**（period end date），非公布日 |
| 會計年度 | `fyear` | `fyearq` | fiscal year |
| 會計季 | — | `fqtr` | fiscal quarter |
| 財報公布日 | — | `rdq` | Report Date of Quarterly earnings（earnings announcement date） |
| 總資產 | `AT` | `ATQ` | Total Assets |
| 營收 | `SALE` | `SALEQ` | Sales/Revenue |
| 淨利 | `NI` | `NIQ` | Net Income |
| 普通股權益 | `CEQ` | `CEQQ` | Common/Ordinary Equity |
| 稅前息前折舊前 | `OIBDP` | `OIBDPQ` | Operating Income Before Depreciation（近似 EBITDA） |
| 總負債 | `LT` | `LTQ` | Total Liabilities |
| 流通股數 | `CSHO` | `CSHOQ` | Common Shares Outstanding |
| 每股盈餘 | `EPSPX` | `EPSPXQ` | EPS (Basic, Excluding Extraordinary Items) |

**關鍵陷阱：`datadate` ≠ report date。** 學術界 `datadate`/`period end date` 指財報「所屬期間的結束日」（如 12/31），而財報實際公布（可用）日是 `rdq`（Compustat quarterly）或 SEC filing date。國際財務語彙中 "report date" 一詞模糊，可能指前者也可能指後者——平台必須拆成兩個獨立欄位（建議 `fiscal_period_end_date` 與 `filing_date`/`announcement_date`），否則就是 look-ahead bias 的溫床。（實證上，Compustat `rdq` 與 `datadate` 有時 `rdq < datadate`、有時 `rdq` 落在 datadate+90 天之後，處理 lag 時須逐筆檢查。）

年度/季度/滾動期間標準縮寫：
- annual（年度）、quarterly（季度）。
- **TTM（Trailing Twelve Months）= LTM（Last Twelve Months）**：兩者意義相同、可互換；股票研究與公司財報常用 TTM，投資銀行偏好 LTM。公式：`TTM = 最新完整會計年度 + 當期 YTD − 去年同期 YTD`。**注意：只有損益表/現金流量表的 flow 科目可加總成 TTM；資產負債表的 stock（時點）科目不可加總，須直接取最近時點值。**
- YTD（year-to-date，年初至今）：季報常只揭露累計數（cumulative），需把累計拆成單季（discrete quarter）——英文標準說法為 "cumulative（YTD）vs discrete/standalone quarter"，單季 = 本期累計 − 上期累計。
- NTM（Next Twelve Months，未來十二個月）為前瞻對應詞。

### 四、Point-in-Time / 版本化（PIT & Versioning）
這是量化平台避免 look-ahead bias 的命脈，也是 DDD 最需要嚴謹建模之處。

| 概念 | 標準英文術語 | 語意 |
|---|---|---|
| 原始公布值 | as-reported / as-first-reported / first-reported / preliminary | 當時實際揭露、未經事後修正的值 |
| 事後重編值 | as-restated / restated / final | 公司事後重編或供應商標準化後的值 |
| 資料可用日 | knowledge date / availability date / filing date | 該筆資訊實際「可被知悉」的日期；backtest 決策點須以此為準 |
| 資料版本 | vintage | 某一時點所見的整份資料快照（如 FRED 的 ALFRED、Compustat Snapshot/Point-in-Time） |
| 修正 | revision / restatement | 對既有值的更新 |
| 前瞻偏誤 | look-ahead bias | 使用當時尚不可得的資訊 |
| 存活偏誤 | survivorship bias | 只納入今日仍存在的標的，漏掉退市/併購/破產者 |

學術界標準實作原則：對財報用「as-reported + filing date timestamp」而非 as-restated；對總經資料用 point-in-time 庫（如 ALFRED）而非最新修正序列（FRED）。CRSP `RET` 的 split/dividend 調整必須以「當時已知」的方式進行，不可用未來才知道的 split 比例。Yale 一篇研究（Re-Standardized Financial Statement Data）指出，Compustat 會隨時間標準化與更新，導致「用不同時點取得的資料精確複製前人研究幾乎不可能」——這是必須用 Compustat Snapshot/PIT 產品保存「當時所見值」的直接證據。學界共識是 Compustat 為財報資料的 de facto 學術標準庫。

**建議 domain model：** 每筆財報事實至少帶 `fiscal_period_end_date`、`filing_date`（=knowledge date）、`data_vintage`（版本）、`is_restated`（bool）、`source_version`，讓同一 fiscal period 可存多個版本（bitemporal 設計：valid time = fiscal period，transaction time = knowledge/vintage）。

### 五、常用衍生指標標準命名（Derived Metrics）
這些是全球通用、命名一致度最高的一組，建議直接採用縮寫大寫或 snake_case：

| 指標 | 標準名 | 標準公式/語意 |
|---|---|---|
| 股東權益報酬率 | ROE (Return on Equity) | Net Income / Shareholders' Equity |
| 資產報酬率 | ROA (Return on Assets) | Net Income / Total Assets |
| 投入資本報酬率 | ROIC (Return on Invested Capital) | NOPAT / Invested Capital（Invested Capital = PP&E + Intangibles + Working Capital − Cash） |
| 運用資本報酬率 | ROCE (Return on Capital Employed) | EBIT / Capital Employed（EBIT 近似 operating income） |
| 每股盈餘 | EPS — basic / diluted | 基本 / 稀釋 |
| 每股淨值 | BVPS (Book Value Per Share) | Compustat `BKVLPS` |
| 市值 | Market Cap / Market Capitalization | Price × Shares Outstanding；Bloomberg `CUR_MKT_CAP` |
| 企業價值 | EV (Enterprise Value) | Market Cap + Total Debt − Cash |
| 稅前息前折舊攤銷前獲利 | EBITDA | 有多種近似；Compustat 常用 `OIBDP` |
| 自由現金流 | FCF (Free Cash Flow) | Operating Cash Flow − CapEx（近似） |
| 貝他值 | beta | 系統性風險敏感度；CRSP/WRDS Beta Suite 提供 |
| 各種利潤率 | margin — gross / operating / net margin | 毛利率/營業利益率/淨利率 |

**EV/EBITDA、EV/EBIT、P/E、P/B（book-to-market 的倒數）** 為標準估值倍數。學術界用 book-to-market（B/M），實務界常用其倒數 price-to-book（P/B），兩者互為倒數需註明方向。

### 六、Fama-French 因子與投組命名（Factors & Portfolios）
Ken French Data Library 是因子命名的事實標準：
- `Mkt-RF`（或 `Rm-Rf`）：市場超額報酬（value-weight 全市場報酬 − 一個月國庫券率）。
- `SMB`（Small Minus Big）：規模因子。
- `HML`（High Minus Low）：價值因子，依 book-to-market equity（B/M）高低。
- `RMW`（Robust Minus Weak）：獲利能力因子。
- `CMA`（Conservative Minus Aggressive）：投資因子。
- `UMD`/`MOM`（Up Minus Down / Momentum）：動能因子（Carhart）。
- `RF`：無風險利率（一個月國庫券）。

因子建構詞：value-weight（市值加權）、breakpoint（分位斷點，如 NYSE median）、double-sort（雙重排序）、zero-cost / long-short portfolio（零成本多空投組）。SMB/HML 的形成用 6 個 size×B/M value-weight 投組（依 NYSE median 分 size 兩組、B/M 分 30%/40%/30% 三組交叉）。

### 七、WRDS 連結慣例（CCM Linking）
CRSP-Compustat 的橋接是 CCM（CRSP/Compustat Merged），連結表為 `ccmxpf_lnkhist`：
- 對照鍵：Compustat `GVKEY` ↔ CRSP `LPERMNO`/`LPERMCO`（linked permno/permco）。
- `LINKTYPE`：連結類型。據 WRDS support page（經 Mingze Gao「Merge Compustat and CRSP」引述）：「Primary link types (LC, LU and LS) account for 41% of the links in CCM. Secondary link types (LX, LD and LN) account for only 2%. ... Generally, using LC and LU should be sufficient.」其餘約 57% 為 NR/NU 不匹配（因兩庫涵蓋範圍不同，屬預期現象）。一般用 `LC` + `LU` 即足夠。
- `LINKPRIM`：連結主從（`P`=primary、`C`=primary assigned by Compustat 等）。
- `LINKDT` / `LINKENDDT`：連結有效起訖日（`.B`=最早、`.E`=最晚）。

連結須帶有效期間，體現 point-in-time 精神。IBES（分析師預估）則透過 ICLINK 對到 CRSP permno。

### 八、交易/籌碼資料（Chip Data）—— 台灣概念對應國際用語
台灣籌碼面概念在國際資料界的對應：

| 台灣概念 | 建議英文標準命名 | 國際對應與制度差異 |
|---|---|---|
| 三大法人 | three major institutional investors / institutional investors | 外資、投信、自營商三類的合稱 |
| 外資（買賣超） | foreign investors (net buy/sell) | TWSE 官方英文為 Foreign Investors；資料源為證交所官方 T86 報表「Daily Trading Details of Foreign and Other Investors」 |
| 投信 | investment trust / securities investment trust companies (SITC) | 國內共同基金 |
| 自營商 | dealers（proprietary/dealers' proprietary account） | 自營帳戶 |
| 買賣超 | net buy/sell（net buy = purchase − sale） | 每日 T+1 揭露、公開回溯至 2012/04（TWSE 與 TPEx 均自 2012/04 起） |
| 法人持股比率 | institutional ownership (IO) | 美國學術定義：13F 持股 / shares outstanding |
| 融資（餘額） | margin trading / margin purchase (balance) | TWSE `MI_MARGN` feed；融資餘額 = margin purchase balance |
| 融券（餘額） | short selling / short sale (balance) | 借券放空的餘額 |
| 券資比 | short-to-margin ratio | 融券餘額 / 融資餘額 |
| 張（交易單位） | lot（1 lot = 1,000 shares） | 台灣以「張」為單位 |

美國對應的放空指標：short interest（放空股數）、short interest ratio = days to cover（放空股數 / 日均量，通常取近 30 交易日）。institutional ownership 在美國源自 SEC Form 13F 季度申報。**制度差異須在 glossary 註明：**
- **美國 13F：** 依 SEC 官方 Form 13F 說明（sec.gov/files/form13f.pdf），對 $100M 以上 Section 13(f) 證券行使投資裁量權的機構投資經理人須「within 45 days after the end of the calendar year and each of the first three calendar quarters」申報，故揭露資訊本質上落後至少 45 天，且僅含美股多頭部位（不含放空、現金、非美部位）。
- **美國 short interest：** 依 FINRA「Short Interest Reporting」，券商須每月兩次申報（mid-month 以 15 日結算日、month-end 以當月最後結算日結算，一年共 24 次），FINRA 於「結算日後第 7 個營業日」（seven business days after the reporting settlement date）揭露彙整放空資訊。
- **台灣：** 融資融券為散戶槓桿與放空的每日資料、三大法人買賣超亦每日 T+1 揭露，時效遠優於美制。

### 九、市場結構詞彙（Market Structure）
- universe：可投資標的全集（backtest 須用 point-in-time universe 避免 survivorship bias）。
- constituent / index membership：成分股 / 指數成分。
- addition / deletion：納入 / 剔除；伴隨 announcement date、effective date、rank day（如 Russell 每年 4 月底 rank day、6 月最後一個週五收盤後生效）。
- reconstitution：重組成分（改變成分名單）；rebalancing：再平衡（改變權重）——兩者不同，常同時排程但解決不同問題。
- delisting：下市/退市（CRSP `DLSTCD`/`DLRET`）。
- suspension：暫停交易（台灣融資融券亦有 suspension 機制）。

## Details（命名衝突與易混淆處總整理）

1. **close vs last：** `close` 是「當日/當期收盤價」（歷史 EOD），`last` 是「最新一筆成交價」（即時報價，如 Bloomberg `PX_LAST`）。Bloomberg 的 `PX_LAST` 在日內指最新價、日終等於收盤，語意隨情境浮動。建議平台在 domain model 明確分：`close_price`（EOD bar）與 `last_price`（即時 quote），不可混用。

2. **adjusted 的多義：** 「adjusted close」在不同來源意義不同——CRSP `RET` 是「含息且 split 調整」的 total return；多數 API 的 `adjClose`/`Adj Close`（Tiingo/yfinance）是「split + dividend 調整」；Polygon 的 `adjusted=true` 僅 split 調整（不含息）。務必區分 `split_adjusted` vs `total_return_adjusted`（split+dividend）。建議欄位：`close_raw`、`close_split_adj`、`close_total_return_adj` 三者分開。

3. **total return vs price return：** CRSP `RET`（含息）vs `RETX`（不含息）。建議 `total_return` vs `price_return`。

4. **report date 歧義：** 如前述，`datadate`（fiscal period end）vs `rdq`/filing date（公布日）。國際 "report date" 一詞不可單獨使用。

5. **TTM vs LTM：** 意義相同可互換，但團隊應**擇一**作為 canonical（建議 `ttm`，因開發者生態較常用），並在 glossary 註明 LTM 為同義詞，避免 schema 同時出現兩者。

6. **CFACPR vs CFACSHR：** 通常相等但非必然（spin-off/rights 時分歧），不可假設兩者恆等而只存一個。

7. **market cap 的時點：** Bloomberg `CUR_MKT_CAP` 是當前市值；學術界常用 `abs(PRC) × SHROUT`（CRSP）於特定時點。須註明用哪個時點的價與股數。

8. **shares outstanding 單位：** CRSP `SHROUT` 為千股、Compustat `CSHOQ` 為百萬（依檔案），單位陷阱必須在欄位註釋標明。

## Recommendations（可直接落地的命名規範）

**第一階段 — 建立 canonical glossary 與五大 bounded context。** 立即定義五個 context：`identifier`、`market_data`（price/quote）、`fundamental`、`point_in_time`、`chip`（籌碼）。每個 context 一張 glossary，欄位採 **lowercase snake_case**（對齊 OpenBB/Polygon 生態，也最適合 DB schema 與 JSON API）。識別碼永久鍵用 surrogate key + 帶生效期間的識別碼歷史表（照抄 CRSP PERMNO + NCUSIP 模式）；若需一個全球開放、永不重用的外部鍵，FIGI 是首選（免授權費、可再散布）。

**第二階段 — 拆開所有歧義欄位。** 強制執行：`close_price` vs `last_price`；`close_raw`/`close_split_adj`/`close_total_return_adj`；`total_return` vs `price_return`；`fiscal_period_end_date` vs `filing_date`；價格調整用 `price_adj_factor` / `share_adj_factor`（對應 CFACPR/CFACSHR，且兩者分開存不假設相等）。財報事實表採 bitemporal（valid time = fiscal period，transaction time = knowledge date/vintage），欄位含 `is_restated`、`data_vintage`。

**第三階段 — 台灣籌碼本地化對映層。** 在 `chip` context 用國際標準英文欄位（`foreign_net`、`investment_trust_net`、`dealer_net`、`margin_purchase_balance`、`short_sale_balance`、`short_to_margin_ratio`），並在 glossary 註記其與美國 13F（季度、季末後 45 天內申報）／FINRA short interest（每月兩次、結算日後第 7 個營業日）的制度差異與揭露頻率。單位（張/lot、千股、百萬）一律在欄位 metadata 標明。

**第四階段 — 衍生指標與因子層。** 衍生指標用全球通用縮寫（`roe`、`roa`、`roic`、`roce`、`ev`、`ebitda`、`fcf`、`bvps`、`market_cap`、`beta`），每個都在 glossary 附標準公式與所用時點。因子沿用 Fama-French 命名（`mkt_rf`、`smb`、`hml`、`rmw`、`cma`、`umd`、`rf`）。

**改變門檻/benchmark：** 若平台未來要接 Bloomberg/LSEG/FactSet 商業源，則在各 source service 內建「vendor field → canonical field」對映表（如 OpenBB 的 `__alias_dict__` 模式），不要讓 vendor mnemonic 洩漏到 data platform 層以上。若回測出現無法解釋的績效虛高，優先檢查是否誤用 restated 值或未用 point-in-time universe——這兩者是 look-ahead/survivorship bias 最常見的來源。

## Caveats
- 各供應商完整 mnemonic 字典（Bloomberg FLDS、FactSet FQL 全表、Capital IQ、Morningstar）數以千計且部分為付費授權內容，本報告僅涵蓋最常用、可公開查證者；導入前應以各官方文件核對確切欄位與單位。
- Compustat 欄位語意（尤其 `fyear` 定義、fiscal year 變更造成的 GVKEY-datadate 重複、`fqtr` 為 NA 等 edge case）有已知複雜性，建置 fundamental context 時須讀 WRDS「Understanding the Data」原始手冊；`(gvkey, datadate, fyr)` 才是 quarterly「standard」子集的有效主鍵。
- 開發者 API（yfinance 尤甚）存在資料品質與 survivorship bias 問題，且 yfinance 為非官方、Yahoo 改版時常斷線；正式環境勿單一依賴。
- 台灣三大法人/融資融券的精確計算（如投信持股率的基準、外資分類、自營商避險 vs 自營）各資料商（如 TEJ）處理不同，跨源整合時須對齊定義。
- 部分次級來源（部落格、課程講義）用於佐證慣例，核心數值與欄位定義均以 CRSP/Compustat/WRDS/官方交易所/官方 API 文件為準；如有衝突以官方原始文件為最終依據。