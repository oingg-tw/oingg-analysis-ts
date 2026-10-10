# Ubiquitous Language：oingg 生態系官方詞彙表

**這是 oingg 生態系唯一的官方詞彙表（single source of truth）。** 涵蓋範圍：
- 上游來源服務：twse-ts、tpex-ts、mops-ts、gov-ts、sitca-ts。
- 中游：analysis-ts。
- 下游：業務中台（oingg-business-ts）、web-nuxt。

2026-10-10 使用者指定由 analysis-ts 主導，全面改名。各服務沒有共用文件的機制，所以其他 repo 的 CLAUDE.md 用絕對路徑
`C:\Users\Chuia\Documents\oingg-analysis-ts\UBIQUITOUS_LANGUAGE.md` 指向這裡，**不要複製一份**。複製的副本一定會漂移，
`oingg-analysis-ts-twse\UBIQUITOUS_LANGUAGE.md` 就是例子。

放在 repo 根目錄、不放 `docs/`：`docs/` 是隨手筆記，可能被清掉，這份是跨服務引用的參考資料。conductor 的舊版跨服務詞彙表
（`docs/1_extracted/ubiquitous-language-glossary.md`）2026-09-06 在 vault 重整時被刪（commit `53a1af2`），
內容已併入下方第二節與第五節。

## 一、治理

- **誰定詞**：analysis-ts 維護這份文件。各服務發現新的命名落差，或要新增跨服務概念，就 SendMessage 給 analysis-ts，由它補進來。
  conductor 在跨服務稽核時找出新落差，也一樣回報到這裡。
- **定詞優先順序**（2026-10-10 使用者：「要極力以 XBRL 的名稱為主」）：
  1. **XBRL 元素名稱**，轉成 snake_case 的規則同 mops `account_code`（`ProfitLossAttributableToOwnersOfParent` → `profit_loss_attributable_to_owners_of_parent`）。
     - 同一概念在不同產業的元素名稱不同時（例：普通股股本，一般業 `OrdinaryShare`、金控 `CommonStock`），**優先用 ifrs-full 的 line item 元素**，不分產業；ifrs-full 沒有才用一般業（ci）的 tifrs 元素。其他產業的元素名稱列在對照欄。
     - 查證來源：mops-ts 的 `scripts/data/taxonomy/<版本>/*.json`（`concepts`）。每個標成 XBRL 的名稱都要查得到原元素；
       TW 分類標準沒有、照 IFRS 構詞的要標「借用 IFRS 構詞」。2026-10-10 由 mops-ts 逐列核對過（四個版本 × 六個產業入口）。
  2. XBRL 沒有的概念，才用主管機關的官方代碼（MOPS TYPEK、MOPS `data_type`、REPORT_ID）。
  3. 以上都沒有，才用外部研究報告的慣例或生態系既有名稱。
  - **例外**：月營收維持 `revenue` 字根（使用者 10/10；月營收公告不是 XBRL）。剛好跟營收的元素 `ifrs-full:Revenue` 同字根。
  - **中文**：程式裡的名稱（DB 欄位、API key）照 XBRL；使用者看到的中文照券商軟體習慣（例「稅後淨利」），下表另列 XBRL 中文標籤。
  - **PostgreSQL 63 字元上限**：元素名放不下時，照第六節的**縮寫字典**縮，對照表也在第六節（使用者 10/10：人工縮寫＋對照表，不用截斷加雜湊）。
    只有超過 63 字元才縮，而且一律照字典，所以任何人縮出來都一樣。
- **其他原則**（沿用 conductor〈跨服務命名裁定原則〉）：
  1. 語意不確定就先抽樣查實際資料驗證，不憑「聽起來比較精確」決定。
  2. 名稱一樣但分類系統不同時，不硬併成一個名字，改成在名稱上就能分辨。
  3. 一個名字只能有一種意思（同名不同義是最常造成靜默錯誤的形狀）。
- **大小寫**：資料庫用 snake_case，API 的 JSON 用 camelCase，兩者是同一個詞的兩種寫法，不另外取名。
  指標代碼（`metricCode`）有公認縮寫就用縮寫（`roe`、`eps`），沒有就用完整 camelCase，禁止自創縮寫。
- **使用者可見的指標名稱**（`name`）只在 analysis-ts 維護，web-nuxt 直接顯示，不另存一份（見 `docs/api-conventions.md`）。
- **改名程序**（2026-10-10 使用者核准）：
  1. **上游 view**：view 先多輸出新欄名，舊欄名保留 → 通知 analysis-ts → analysis-ts 改讀新欄名並驗證新舊值逐列相同 → 14 天後上游移除舊欄名。
  2. **analysis-ts 對外 API**：照 `docs/api-conventions.md`，新舊並存 14 天、附 openapi diff，再移除舊 key。
  3. **值的編碼變了**（例如市場別、財報口徑代碼）：新欄位用新編碼，舊欄位維持舊編碼直到移除；**不在同一個欄位裡換編碼**。
  4. **各服務的改動要該服務的使用者親自核准**：轉述的核准不算。
  5. 全部先上 DEV；PRD 等使用者指示。
  6. **不改名的**：
     - metricCode：業務中台的使用者資料會被連帶刪除，要改就走 metricCode 改名程序。
     - GCP 專案 ID：GCP 不允許改名。
- **資料集歸屬**（使用者 10/10）：同一份來源只由一個服務收。data.gov.tw 的資料集一律歸 gov-ts，生態系從 gov 讀；sitca-ts 退掉重複的 11109（每日淨值）、43476（境內基金基本資料）。
- **範圍**：這份詞彙表管的是**對外介面**，也就是各服務的 export view 和 API。內部表與欄位要不要跟著改，由該服務自己決定（sitca-ts 10/10 提出、analysis 同意：只在 view 層用別名欄位，不動表）。
- **防退化**（2026-10-10 上線）：analysis-ts 的 `tests/contract/retiredTerms.test.ts` 掃 openapi 文件，出現下表的退役詞就失敗。並存期內的舊參數列在允許清單、標上到期日。

## 二、官方用詞表

「落差」欄記錄還沒改完的地方和負責的服務，改完就移到第五節的改名追蹤表。

### 二之一、識別與分類

| 概念 | 官方 DB 欄位／值 | 官方 API key／值 | 中文 | 退役的同義詞 | 落差（負責服務） |
|---|---|---|---|---|---|
| 證券代號 | `symbol`＝證券本身（特別股 `2881A` 有自己的 symbol）；母公司用 `company_symbol` | `symbol` | 代號 | stock_code、security_code、code、公司代號 | mops 特別股表 `symbol` 存的是母公司，特別股本身放在 `preferred_stock_code`（mops）；twse `v_fs_*` 還輸出中文欄名 `"公司代號"`（twse） |
| 市場別 | `market` ∈ `sii` 上市／`otc` 上櫃／`rotc` 興櫃（MOPS TYPEK，唯一兩個交易所共用的官方代碼，mops 實測三種都有）；公開發行暫定 `pub`（mops 資料裡沒有，待查證 MOPS 代碼） | `market` 同值域 | 上市／上櫃／興櫃／公開發行 | TWSE／TPEx＋isEmerging、L／X／O／U、中文「上市」、拿 `source` 表示市場 | twse、tpex 用 `source` 表示市場族群；`'COMPANY_PROFILE'` 在 twse 指上市、在 tpex 指上櫃（twse、tpex）。fs 的 `market` 是 L／X／O／U（twse、tpex）。analysis API 是 `'TWSE'\|'TPEx'`＋`isEmerging`（analysis）。業務中台在缺值時預設 TWSE（業務中台） |
| 資料出處 | `source`：**只**代表這一列來自哪份報表或哪種推導（例：`TPEX_T187AP05`、`MOPS_T21SC03`、`document`、`comparative`） | `source` | 出處 | 拿 `source` 表示市場族群 | 同上一列（twse、tpex） |
| 類股 | `sector_code`（兩碼證交所產業類別）／`sector_name` | `sectorCode`／`sectorName` | 類股 | industry、industry_code（指類股時）、industry_name、industry_category、類股字典端點的 `{code,name}` | twse、tpex 叫 `industry`／`industry_name`；月營收的 `industry` 存的是名稱（twse、tpex）。mops 叫 `industry_category`（mops）。analysis profile 的 `industry`／`industryName` 上櫃一律 null（analysis）。同一代碼名稱不一致：14、16、17、20、33（tpex 對齊 twse） |
| 報表格式業別 | `statement_format`（`ci`／`bd`／`fh`／`ins`／`basi`／`mim`），**不是**類股 | — | 報表格式 | industry_type | twse、tpex 的 fs 叫 `industry_type`（twse、tpex） |
| 公司名稱 | `company_name` | `companyName` | 公司名稱 | 拿 `name`／`issuerName` 表示公司名稱 | 業務中台把 `companyName` 轉成 `name`；ETF 那處轉成 `issuerName`，要先確認是不是發行投信（業務中台） |
| 投信代號 | `member_code`（SITCA 稱「會員代號」，照源頭；值如 `A0047`） | `memberCode` | 投信代號 | company_code | sitca `fund_etf_daily_navs.company_code`，sitca 實測跟 `member_code` 同一個概念，不一致的兩組是新光投信併入台新投信（sitca）；gov 10/10 實測 82,682 列全部符合 `^A[0-9]{4}# Ubiquitous Language：oingg 生態系官方詞彙表

**這是 oingg 生態系唯一的官方詞彙表（single source of truth）。** 涵蓋範圍：
- 上游來源服務：twse-ts、tpex-ts、mops-ts、gov-ts、sitca-ts。
- 中游：analysis-ts。
- 下游：業務中台（oingg-business-ts）、web-nuxt。

2026-10-10 使用者指定由 analysis-ts 主導，全面改名。各服務沒有共用文件的機制，所以其他 repo 的 CLAUDE.md 用絕對路徑
`C:\Users\Chuia\Documents\oingg-analysis-ts\UBIQUITOUS_LANGUAGE.md` 指向這裡，**不要複製一份**。複製的副本一定會漂移，
`oingg-analysis-ts-twse\UBIQUITOUS_LANGUAGE.md` 就是例子。

放在 repo 根目錄、不放 `docs/`：`docs/` 是隨手筆記，可能被清掉，這份是跨服務引用的參考資料。conductor 的舊版跨服務詞彙表
（`docs/1_extracted/ubiquitous-language-glossary.md`）2026-09-06 在 vault 重整時被刪（commit `53a1af2`），
內容已併入下方第二節與第五節。

## 一、治理

- **誰定詞**：analysis-ts 維護這份文件。各服務發現新的命名落差，或要新增跨服務概念，就 SendMessage 給 analysis-ts，由它補進來。
  conductor 在跨服務稽核時找出新落差，也一樣回報到這裡。
- **定詞優先順序**（2026-10-10 使用者：「要極力以 XBRL 的名稱為主」）：
  1. **XBRL 元素名稱**，轉成 snake_case 的規則同 mops `account_code`（`ProfitLossAttributableToOwnersOfParent` → `profit_loss_attributable_to_owners_of_parent`）。
     - 同一概念在不同產業的元素名稱不同時（例：普通股股本，一般業 `OrdinaryShare`、金控 `CommonStock`），**優先用 ifrs-full 的 line item 元素**，不分產業；ifrs-full 沒有才用一般業（ci）的 tifrs 元素。其他產業的元素名稱列在對照欄。
     - 查證來源：mops-ts 的 `scripts/data/taxonomy/<版本>/*.json`（`concepts`）。每個標成 XBRL 的名稱都要查得到原元素；
       TW 分類標準沒有、照 IFRS 構詞的要標「借用 IFRS 構詞」。2026-10-10 由 mops-ts 逐列核對過（四個版本 × 六個產業入口）。
  2. XBRL 沒有的概念，才用主管機關的官方代碼（MOPS TYPEK、MOPS `data_type`、REPORT_ID）。
  3. 以上都沒有，才用外部研究報告的慣例或生態系既有名稱。
  - **例外**：月營收維持 `revenue` 字根（使用者 10/10；月營收公告不是 XBRL）。剛好跟營收的元素 `ifrs-full:Revenue` 同字根。
  - **中文**：程式裡的名稱（DB 欄位、API key）照 XBRL；使用者看到的中文照券商軟體習慣（例「稅後淨利」），下表另列 XBRL 中文標籤。
  - **PostgreSQL 63 字元上限**：元素名放不下時，照第六節的**縮寫字典**縮，對照表也在第六節（使用者 10/10：人工縮寫＋對照表，不用截斷加雜湊）。
    只有超過 63 字元才縮，而且一律照字典，所以任何人縮出來都一樣。
- **其他原則**（沿用 conductor〈跨服務命名裁定原則〉）：
  1. 語意不確定就先抽樣查實際資料驗證，不憑「聽起來比較精確」決定。
  2. 名稱一樣但分類系統不同時，不硬併成一個名字，改成在名稱上就能分辨。
  3. 一個名字只能有一種意思（同名不同義是最常造成靜默錯誤的形狀）。
- **大小寫**：資料庫用 snake_case，API 的 JSON 用 camelCase，兩者是同一個詞的兩種寫法，不另外取名。
  指標代碼（`metricCode`）有公認縮寫就用縮寫（`roe`、`eps`），沒有就用完整 camelCase，禁止自創縮寫。
- **使用者可見的指標名稱**（`name`）只在 analysis-ts 維護，web-nuxt 直接顯示，不另存一份（見 `docs/api-conventions.md`）。
- **改名程序**（2026-10-10 使用者核准）：
  1. **上游 view**：view 先多輸出新欄名，舊欄名保留 → 通知 analysis-ts → analysis-ts 改讀新欄名並驗證新舊值逐列相同 → 14 天後上游移除舊欄名。
  2. **analysis-ts 對外 API**：照 `docs/api-conventions.md`，新舊並存 14 天、附 openapi diff，再移除舊 key。
  3. **值的編碼變了**（例如市場別、財報口徑代碼）：新欄位用新編碼，舊欄位維持舊編碼直到移除；**不在同一個欄位裡換編碼**。
  4. **各服務的改動要該服務的使用者親自核准**：轉述的核准不算。
  5. 全部先上 DEV；PRD 等使用者指示。
  6. **不改名的**：
     - metricCode：業務中台的使用者資料會被連帶刪除，要改就走 metricCode 改名程序。
     - GCP 專案 ID：GCP 不允許改名。
- **資料集歸屬**（使用者 10/10）：同一份來源只由一個服務收。data.gov.tw 的資料集一律歸 gov-ts，生態系從 gov 讀；sitca-ts 退掉重複的 11109（每日淨值）、43476（境內基金基本資料）。
- **範圍**：這份詞彙表管的是**對外介面**，也就是各服務的 export view 和 API。內部表與欄位要不要跟著改，由該服務自己決定（sitca-ts 10/10 提出、analysis 同意：只在 view 層用別名欄位，不動表）。
- **防退化**（第四階段加上）：analysis-ts 的 `tests/contract/retiredTerms.test.ts` 掃 openapi 文件，出現下表的退役詞就失敗。並存期內的舊參數列在允許清單、標上到期日。

## 二、官方用詞表

「落差」欄記錄還沒改完的地方和負責的服務，改完就移到第五節的改名追蹤表。

### 二之一、識別與分類

| 概念 | 官方 DB 欄位／值 | 官方 API key／值 | 中文 | 退役的同義詞 | 落差（負責服務） |
|---|---|---|---|---|---|
| 證券代號 | `symbol`＝證券本身（特別股 `2881A` 有自己的 symbol）；母公司用 `company_symbol` | `symbol` | 代號 | stock_code、security_code、code、公司代號 | mops 特別股表 `symbol` 存的是母公司，特別股本身放在 `preferred_stock_code`（mops）；twse `v_fs_*` 還輸出中文欄名 `"公司代號"`（twse） |
| 市場別 | `market` ∈ `sii` 上市／`otc` 上櫃／`rotc` 興櫃（MOPS TYPEK，唯一兩個交易所共用的官方代碼，mops 實測三種都有）；公開發行暫定 `pub`（mops 資料裡沒有，待查證 MOPS 代碼） | `market` 同值域 | 上市／上櫃／興櫃／公開發行 | TWSE／TPEx＋isEmerging、L／X／O／U、中文「上市」、拿 `source` 表示市場 | twse、tpex 用 `source` 表示市場族群；`'COMPANY_PROFILE'` 在 twse 指上市、在 tpex 指上櫃（twse、tpex）。fs 的 `market` 是 L／X／O／U（twse、tpex）。analysis API 是 `'TWSE'\|'TPEx'`＋`isEmerging`（analysis）。業務中台在缺值時預設 TWSE（業務中台） |
| 資料出處 | `source`：**只**代表這一列來自哪份報表或哪種推導（例：`TPEX_T187AP05`、`MOPS_T21SC03`、`document`、`comparative`） | `source` | 出處 | 拿 `source` 表示市場族群 | 同上一列（twse、tpex） |
| 類股 | `sector_code`（兩碼證交所產業類別）／`sector_name` | `sectorCode`／`sectorName` | 類股 | industry、industry_code（指類股時）、industry_name、industry_category、類股字典端點的 `{code,name}` | twse、tpex 叫 `industry`／`industry_name`；月營收的 `industry` 存的是名稱（twse、tpex）。mops 叫 `industry_category`（mops）。analysis profile 的 `industry`／`industryName` 上櫃一律 null（analysis）。同一代碼名稱不一致：14、16、17、20、33（tpex 對齊 twse） |
| 報表格式業別 | `statement_format`（`ci`／`bd`／`fh`／`ins`／`basi`／`mim`），**不是**類股 | — | 報表格式 | industry_type | twse、tpex 的 fs 叫 `industry_type`（twse、tpex） |
| 公司名稱 | `company_name` | `companyName` | 公司名稱 | 拿 `name`／`issuerName` 表示公司名稱 | 業務中台把 `companyName` 轉成 `name`；ETF 那處轉成 `issuerName`，要先確認是不是發行投信（業務中台） |
| 投信代號 | `member_code`（SITCA 稱「會員代號」，照源頭；值如 `A0047`） | `memberCode` | 投信代號 | company_code | sitca `fund_etf_daily_navs.company_code`，sitca 實測跟 `member_code` 同一個概念，不一致的兩組是新光投信併入台新投信（sitca）；、36 個代號，跟 sitca 是同一欄。**代號是穩定的鍵，公司名稱不是**（A0021 對到「大都會投信」與「柏瑞投信」兩個名稱，疑為改名或合併後沿用），join 投信一律用代號 |
| 基金代號（SITCA） | `sitca_fund_code`：SITCA 內部基金代號，**不唯一、不是證券代號，不能當鍵** | `sitcaFundCode` | 基金代號 | fund_code | gov `fund_basic_info.fund_code`、`fund_daily_nav.fund_code`（gov） |
| 基金統編 | `fund_tax_id` | `fundTaxId` | 基金統編 | fund_id；拿 fund_code 表示統編 | sitca fundclear 的 `fund_code` 是統編、gov `fund_code` 是基金代號、tdcc `fund_code` 是境外基金代碼，三義（sitca、gov）。投信代號 `member_code`／`company_code` 是否同一概念待驗證 |
| 服務名稱 | repo `oingg-business-ts`；環境變數 `BUSINESS_API_KEY` | — | **業務中台**；web-nuxt 的 Nitro 叫「web-nuxt 伺服器層」 | BFF、bff、應用後端 | analysis 的 `BFF_API_KEY`、`bffAuth.ts`（analysis）；業務中台的環境變數與 Cloud Run 服務名（業務中台）；web-nuxt 的 `/api/bff`、`bffBase`，以及把 Nitro 叫 BFF（web-nuxt）。web-nuxt 實測 422 處 BFF 字樣：新寫的文字和註解不再用 BFF；設定名稱（`bffBase`、`NUXT_BFF_*`）改不改由 web-nuxt 的使用者決定；conductor vault 的「應用後端」（conductor） |

### 二之二、期間與日期

| 概念 | 官方 DB 欄位／值 | 官方 API key／值 | 中文 | 退役的同義詞 | 落差（負責服務） |
|---|---|---|---|---|---|
| 年度 | 西元：`year`／`fiscal_year`；**民國一律叫 `roc_year`** | `fiscalYear`（西元，見 api-conventions） | 年度 | 民國年也叫 year、rocFiscalYear | mops xbrl 各表、`fiscal_year` 存民國；`capital_stock_history.license_change_year` 是民國，但同表 `effective_year` 是西元（mops）。twse fs 輸出中文欄名 `"年度"`（twse）。analysis 的 financial-statement、piotroski、metric-provenance 用民國 `year`；dividend-history 有 `rocFiscalYear`（analysis） |
| 季別 | `quarter`＝**單季**；年初累計放在 `cumulative_*` 表 | `fiscalQuarter`；FY 那一列固定是 4 | 單季／累計 | season；累計也叫 quarter | twse 的 fs 沒標明是單季還是累計（twse，待驗證）；**tpex 10/10 實測：損益類（t187ap06、t187ap15／16、t187ap17）是年初累計、資產負債表是季末時點**，已寫進 COMMENT。analysis financial-statement 回 `season`（analysis）。業務中台型別寫 FY 列的 fiscalQuarter 是 null（業務中台） |
| 月份 | `year_month`（DATE，月初那天） | `yearMonth`（"YYYY-MM"） | 月份 | TEXT "YYYYMM"、year＋month 兩欄 | sitca 的 `year_month` 是 TEXT（sitca）；gov 拆成 `year`／`month`（gov）。月頻指標的座標暫用 `fiscalYear`＋`fiscalMonth`（analysis，待定） |
| 期別 | — | `timeframe`：`Q`／`YTD`／`TTM`／`FY`／`N/A`、`<lookbackRange>_<samplingInterval>`、`EOD`、`M` | 期別：單季／累計／近四季／年度 | basis、periodType、period、token | analysis 的 roe、roa、dupont-history、metric-provenance 用 `periodType`（analysis）。業務中台對外叫 `basis`，型錄叫 `period`（業務中台）。web-nuxt 送 `basis`，期別標籤有 4 份副本、缺 M 和 YTD（web-nuxt） |
| 期末日 | `fiscal_period_end_date` | `fiscalPeriodEndDate` | 期末日 | mops 的 report_date、period_end_date | mops 長表 view 已經是 `fiscal_period_end_date`（`report_date AS`），寬表和底表還叫 `report_date`（mops） |
| 公告日 | `announcement_date`：公司或主管機關**公告**的日期 | `announcementDate` | 公告日 | announce_date | twse、tpex 處置股票的 `announce_date`（twse、tpex）。analysis 內部的 `announceDate`（analysis） |
| 出表日 | `generated_date`：交易所 OpenAPI **產生**這份資料的日期，晚於公告日（月營收：2330 2026-08 出表 9/17、實際 9/10 公告；重大訊息：通常是公告日隔天）。**不能拿來當可知悉日** | `generatedDate` | 出表日 | twse、tpex 的 report_date（含月營收、重大訊息、質押、公司基本資料） | twse、tpex 的 company_profile、fs、monthly_revenue、pledge 都用 `report_date`（twse、tpex）。twse 回填的月營收自行填「次月 10 日」，應改成真實公告日，不知道就 null（twse）。analysis 質押比例的 `reportDate`（analysis） |
| 可知悉日 | — | `knowledgeDate`：analysis 認定這筆資料可以被知道的日期；查無公告日、改用期末日頂替時 `knowledgeDateIsFallback=true` | 可知悉日 | — | — |
| 交易日 | `trade_date`：**只能是真實（台灣）交易日**；境外基金的淨值評價日是國外市場的日子，叫 `nav_date` | `tradeDate` | 交易日 | date | twse `changed_trading_methods.trade_date` 存的是觀測日，應改 `observed_date`（twse）。sitca nav 叫 `date`（sitca） |
| 上市日 | `listing_date` | `listingDate` | 上市（櫃）日 | listed_date | twse、tpex 用 `listed_date`（twse、tpex） |
| 除權息日 | `ex_dividend_date`／`ex_rights_date` | `exDividendDate`／`exRightsDate` | 除息日／除權日 | ex_date＋ex_type、ex_right_date | twse 用 `ex_date`＋`ex_type`、tpex 用 `ex_right_date`（twse、tpex） |

### 二之三、財報與數字

| 概念 | 官方 DB 欄位／值 | 官方 API key／值 | 中文 | 退役的同義詞 | 落差（負責服務） |
|---|---|---|---|---|---|
| 財報口徑 | `data_type`：`'2'` 合併（MOPS REPORT_ID `C`、分類標準入口 `*-cr`）、`'1'` 個別（REPORT_ID `A`、入口 `*-ir`：**沒有子公司**的公司） | `dataType`；交易所申報的口徑叫 `declaredDataType`，用同一套編碼 | 合併／個別。**個體**財務報告（有子公司的公司另外申報的母公司報表）是第三種，mops 從沒抓過，生態系目前沒有這種資料（mops-ts 10/10 實測） | financial_report_type（交易所 '1'＝合併，方向**相反**）、report_type（中文）、financialReportType；拿「個體」稱呼 `'1'` | twse、tpex 的 `financial_report_type`（twse、tpex）。mops `company_profile.report_type` 是中文（mops）。analysis API 的 `financialReportType`（analysis）。業務中台註解混用個體與個別（業務中台）。英文 consolidated／individual 是推論，分類標準檔裡沒看到完整字樣 |
| 已發行股數 | `number_of_shares_issued`：股本登記的實收股數，**含特別股與庫藏股**（**借用 IFRS 構詞**：ifrs-full:NumberOfSharesIssued 不在 TW 分類標準，mops 實測四版本六入口都沒有） | `numberOfSharesIssued` | 已發行股數 | paid_in_shares、issued_shares、paidInShares | mops `capital_stock_history.paid_in_shares`（t05st05 登記事件當時的數字，兩次登記之間不累積員工認股、可轉債轉換；面額欄過時時會連帶出錯，例 3093、4763、7780，**不要拿來算每股數字**）（mops）。tpex `issued_shares` 不含特別股，同名不同義（tpex）。analysis API 的 `paidInShares`，說明誤寫成「流通股數」（analysis） |
| 普通股股數 | `number_of_ordinary_shares`（借用 IFRS 構詞） | `numberOfOrdinaryShares` | 普通股股數 | common_stock_shares | mops `company_profile.common_stock_shares`（t05st03 抓取當下的快照，只有普通股）（mops） |
| 流通股數 | `number_of_shares_outstanding`（借用 IFRS 構詞：ifrs-full:NumberOfSharesOutstanding 不在 TW 分類標準）＝已發行股數 − 特別股股數 − 庫藏股股數（第三之一節） | `numberOfSharesOutstanding` | 流通股數 | outstandingCommonShares | 指標 `dependsOn` 與 port 名稱 `OutstandingCommonSharesPort`（analysis） |
| 特別股 | 股本：`preference_share`（ifrs-full 沒有 line item → 一般業 tifrs-bsci-ci:PreferenceShare；金控是 tifrs-bsci-fh:PreferredStock，銀行沒有拆）；股數：`number_of_preference_shares`（分類標準沒有股數元素，借用 IFRS 構詞） | 同名 camelCase | 特別股 | preferred_stock、special_stock_shares | mops `company_profile.special_stock_shares`（mops） |
| 普通股股本 | `ordinary_share`（ifrs-full 沒有 line item → 一般業 tifrs-bsci-ci:OrdinaryShare；金控是 CommonStock，銀行只有 IssuedCapital 合計） | — | 普通股股本 | common_stock | — |
| 庫藏股股數 | 元素 tifrs-bsci-ci:NumberOfSharesInEntityHeldByEntityAndByItsSubsidiaries（銀行是 NumberOfTreasuryShareAcquiredByTheCompanyAndSubsidiariesUnitShare）；snake_case 有 65 字元超過上限，欄名照第六節縮寫字典 | — | 庫藏股股數 | — | mops 現名 `number_of_shares_held_by_entity_and_subsidiaries` 是人工縮的（mops，改照字典） |
| 營收 | `revenue`（ifrs-full:Revenue；tifrs 的 OperatingRevenue 是沒有 GL 代號的標題節點，不存數字） | `revenue` | 營收（＝營業收入） | operating_revenue | — |
| 月營收 | `current_month_revenue`、`prev_month_revenue`、`last_year_same_month_revenue`、`cumulative_revenue`、`cumulative_last_year_revenue`（千元） | 同名 camelCase（個股與類股端點都用這組） | 當月／上月／去年同月／累計／去年累計營收 | last_month_revenue、last_year_cumulative_revenue、lastYearRevenue | mops `market_monthly_revenue` 已照官方名建表（10/10）；類股端點已改（10/10 `40058581`） |
| 財報科目 | 一律用元素名，例 `profit_loss`（ifrs-full:ProfitLoss）、`profit_loss_attributable_to_owners_of_parent`、`shortterm_borrowings`（ifrs-full:ShorttermBorrowings）。應付公司債：ifrs-full:BondsIssued 只出現在 basi、fh、ins，一般業用另一個元素，**待 mops 指定** | 同名 camelCase | 中文照券商：稅後淨利（XBRL 中文標籤「本期淨利」）、歸屬母公司淨利（XBRL「母公司業主」） | 自取的英文翻譯（netIncome、bondsPayable 等） | mops 寬表有 97 個欄位放得下元素名卻被人工改寫（例 `current_fin_assets_fvtoci`、`gains_on_disposals_of_ppe`、`adj_depreciation_expense`、`cash_per_balance_sheet`），另有 91 個人工縮寫、230 個截斷加雜湊，全部改照元素名或縮寫字典（mops，清單 10/10 已索取）。analysis 財報 port 的內部欄位名（`accountsPayable`、`bondsPayable`、`netIncome`）（analysis）。metricCode 字根不是元素名的（例 `bondsPayableToAssets`）列為候選，另走 metricCode 改名程序 |
| 百分比 | `*_pct`：**單位**是百分比（1 ＝ 1%），**不是值域**——變動率、報酬率會是負數或超過 100，不要加 0～100 的 CHECK（sitca-ts 10/10 實測報酬率 −61.94～105.13） | `*Pct` | — | _percent、Percent、_rate（表示 % 時） | 各服務 `*_change_percent`（twse、tpex）。analysis 的 `yoyChangePercent`、`momChangePercent`、`cumulativeChangePercent`、`sharesHeldPercent`、`pledgePercent`（analysis）。業務中台把排行百分比轉成字串（業務中台） |
| 金額與數量單位 | 預設：金額千元、數量股。例外的單位寫進欄名（`_lots`、`_thousand_shares`、`_ntd`）；每個數字欄位都要 COMMENT 寫明單位 | openapi 說明寫單位 | 千元、股、張 | 沒標單位 | twse、tpex 的月營收與 fs 沒標單位（twse、tpex）。`paid_in_capital` 是元（twse、tpex、mops，改 `paid_in_capital_ntd`）。tpex 成交量在 2026-10-01 前不含零股（tpex，寫進 COMMENT） |

### 二之四、API 與顯示用字

| 概念 | 官方 | 退役的同義詞 | 落差（負責服務） |
|---|---|---|---|
| 指標代碼 | `metricCode` | key、path、metricKey、fieldKey、Filter* | 業務中台型錄的 `key`／`path`，screener 的 `metricKey`／`fieldKey`（業務中台）。web-nuxt 的 `FilterMetric`／`FilterCategory` 型別（web-nuxt） |
| 欄位字串 | `metricCode.timeframe`（例 `roe.TTM`） | metricCode.basis | analysis screener 的說明文字（analysis） |
| 排序 | `order: asc\|desc` | direction、sortOrder | analysis 的 ranking、company-rank 用 `direction`，POST screener 用 `sortOrder`（analysis） |
| 沒有值 | `nullReason` 只用 analysis 定義的值域 | 自創 sentinel | web-nuxt 的 `__no_record__` 只能留在前端內部，不能出現在 API（web-nuxt） |
| export view 命名 | 資料 view 用 `export.v_<複數名詞>`；**`export.ingestion_runs` 例外**：它是各服務共用的交接表，不是資料 view，名稱維持不變（gov-ts 10/10）。`ingestion_runs.dataset` 的鍵＝資料 view 名，view 改名時跟著改 | 單數、沒有 `v_` | sitca 沒有 `v_`；mops、gov 是單數且沒有 `v_`（mops、gov、sitca） |
| 中文用字 | 使用者看到的中文照券商軟體：**營收**、**稅後淨利**（合併總額，含非控制權益；XBRL 中文標籤是「本期淨利」）、**歸屬母公司淨利**（另一個概念）。程式名稱照 XBRL（`revenue`、`profit_loss`、`profit_loss_attributable_to_owners_of_parent`） | 顯示用的「本期淨利」 | — |
| 殖利率 | `dividendYield`＝交易所每日公布的殖利率；`cashDividendYield`＝近四季現金股利殖利率 | 把 dividendYield 叫「現金殖利率」 | web-nuxt 的標籤（web-nuxt） |
| 「占」 | 用「占」 | 佔 | 指標名稱「資本支出佔營收比」（analysis） |
| 指標名稱 | 頁面就是那支指標時，一律用 analysis-ts 的 `name`；`topic` 只用在「同一支指標、不同頁面」需要另一個頁名時（例：負債組成頁用 debtRatio） | 頁面就是指標本身時手寫名稱 | dividendCoverageRatio 兩邊名稱不同，web-nuxt 會改用 `name`；web-nuxt 實測 54 個 topic 只有這 1 個是真的不一致（web-nuxt） |

## 三、期間口徑：「第四季」只代表單季，「年報」是另一個概念（2026-09-25 使用者拍板）

| 詞 | 定義 | 讀哪裡 |
|---|---|---|
| **單季（Q）** | quarter=1~4 **全部**是單季；第四季 = 年報全年 − (Q1 + Q2 + Q3 單季)（mops-ts 的推導式，見他們的 `deriveQ4XbrlAmounts.ts`；EPS 不推導，第四季單季 EPS 一律 null）。**第四季絕不代表全年** | `quarterly_income_statement_xbrl`、長表 `cash_flow_quarterly`、銀行/保險表的 `*_quarter` 欄位（`QuarterlyKey` 讀的都是這些） |
| **近四季（TTM）** | 四個單季相加 | 由單季相加，不讀累計表 |
| **年報** | 公司年度財務報告的全年數字，含官方公告的基本每股盈餘（加權平均股數） | 累計表的第四季（`cumulative_income_statement_xbrl` quarter=4、長表 `cash_flow`／`income_statement_cumulative` quarter=4）**而且必須是年報文件解析出來的列**（寬表 `raw_context_ref` 非 null）——沒 ingest 過年報的公司，mops-ts 會用四個單季相加補一列累計第四季（114 年 773 列），那不是年報。讀取介面：`AnnualReportPort`（不帶季別，只認文件列）。另開明確的 `export.annual_income_statement` 待 mops-ts 的使用者同意 |

**為什麼要硬性區分**：台灣沒有「第四季季報」，第四季單季是 mops-ts 從年報減前三季推出來的。
兩者共用 quarter=4 這個座標，一旦單季表的第四季混進年報的全年數字，近四季會安靜地變成
「前三季 + 全年」，數字看起來仍然合理、也不會報錯。2026-09-25 實測（營收一個科目、6,081 個
四季齊全的公司年度）：確定壞在單季第四季的 5 筆（4760 113 年直接等於全年＝推導在 Q1~Q3 入庫前
就跑了、之後沒重推；5348/5543/6776/6811 114 年四季相加 ≠ 全年）；另 114 筆單季與累計對不上但
分不出哪一側壞（1439 111 年是累計側壞），已交 mops-ts 逐筆判斷。現金流量表 8,009 筆、銀行 15 筆正確。

**檢查方法的陷阱**：不要拿累計表當標準答案驗單季（累計側自己也會壞）；「四季單季相加 == 全年」
在 mops-ts 的推導式下只要推導有跑就恆成立，不能證明單季正確——前三季單季高估時差額會被第四季
吸收（2905 114 年第四季營收為負）。mops-ts 會在來源端守 (i) Q1 單季 == Q1 累計、(ii) Q1~Q3 單季和
== Q3 累計、(iii) Q4 單季 == 全年 − Q3 累計。

**規則**：
- `QuarterlyKey` 的 `quarter` 只能拿到單季。要年報的全年數字，走**不帶季別參數**的年報讀取
  介面（做 FY 口徑時才建），不准用 `quarter: 4` 去累計表撈。
- 每股數字：年報 EPS 用加權平均股數；analysis-ts 的每股指標用報告日當下的期末流通股數（見三之一）
  （2026-09-25 實測 112~114 年近四季 EPS 跟年報 EPS 差 ≤0.01 的只有 65%）——不同口徑，不能混著比。
- 既有 11 支 `periodType='FY'` 指標（chowderNumber、dividendGrowthRate 家族、epsCagr 家族等）
  仍是四個單季相加，不是讀年報；股利類的 FY 是「當年度付出去的現金」，不是盈餘所屬年度。

## 三之一、流通股數與普通股每股數字（2026-09-25 使用者拍板，IAS 33）

| 詞 | 定義 | 資料 |
|---|---|---|
| **已發行股數** | 股本變動申報的實收股數，**含特別股與庫藏股** | `capital_stock_history.paid_in_shares`（API 欄位 `paidInShares`，官方名 `numberOfSharesIssued`，見第二之三節與第五節） |
| **流通股數**（＝流通在外普通股） | 已發行股數 − 特別股股數 − 庫藏股股數。所有每股指標的分母都是這個 | port `OutstandingCommonSharesPort`；`dependsOn` 寫 `outstandingCommonShares` |
| **特別股股數** | 權益項下特別股股本（千元）× 1000 ÷ 面額 | 一般業 `preference_share`、金控 `preferred_stock`；銀行待 mops-ts 收 |
| **庫藏股股數** | 本公司及子公司持有本公司股份數（最近一季季末），**不是**庫藏股金額 | 一般業 `number_of_shares_held_by_entity_and_subsidiaries`，金控／銀行各自欄位 |
| **普通股淨利** | 歸屬母公司淨利 − 特別股股利（權益變動表宣告數；單季扣近四季的 1/4）；沒有權益類特別股股本就不扣 | `equity_change_xbrl.cash_dividends_of_preference_share` |
| **普通股權益** | 歸屬母公司權益 − 特別股股本 | — |

「流通股數」這個詞在 formulaNote 裡出現幾十次，指的一律是上表的定義；2026-09-25 之前的實作用的是已發行股數
（沒扣特別股與庫藏股）。**formulaVersion 有跳**（2026-09-26 使用者拍板）：本專案的慣例是「算法變了、值會變就跳版」
（09-22 中繼值不四捨五入也跳過），跟詞義有沒有變無關；而且 formulaVersion 是下游唯一能自動察覺「值變了」的訊號。
讀股數或市值的 67 支一起跳（v1→v2、v2→v3）；沒有庫藏股／特別股的公司新舊公式值相同，直接改版本號不重算。

## 四、股利來源與盈餘發放率（2026-09-25 使用者拍板）

MOPS 股利公告（t108sb27）的原始表頭，mops-ts 從快取的原始 HTML 逐字抽出：
「盈餘分配之股東現金股利(元/股)」、「法定盈餘公積、資本公積發放之現金(元/股)」、「盈餘轉增資配股(元/股)」、
「法定盈餘公積、資本公積轉增資配股(元/股)」、「特別股配發現金股利(元/股)」。**法定盈餘公積與資本公積在公告裡
合在同一欄，拆不開**（mops-ts 的欄位名 `*_from_capital_reserve` 漏了法定盈餘公積，他們會在 schema 註解補上原名）。

| 詞 | 定義 | 出現在哪 |
|---|---|---|
| **現金股利（合計）** | 一次分派決議的每股現金，= 盈餘分配 + 法定盈餘公積與資本公積發放 | `dividend-history` 的 `cashDividend` |
| **盈餘分配** | 公告的「盈餘分配之股東現金股利」。**可能含以前年度累積的未分配盈餘**，不一定是當年賺的 | `cashDividendFromEarnings` |
| **法定盈餘公積與資本公積發放** | 公告的「法定盈餘公積、資本公積發放之現金」，兩種合在一欄：資本公積部分性質是退還股本，法定盈餘公積則是以前年度盈餘提存的 | `cashDividendFromLegalReserveAndCapitalSurplus` |
| **盈餘發放率** | 盈餘分配 ÷ 當年 EPS × 100——只算公告的盈餘分配欄。全部來自公積時是 0%；EPS ≤ 0 時不算 | `dividend-history` 的 `payoutRatio`（2026-09-25 起；之前分子是合計，2882 國泰金 111 年因此顯示 34.88%，實際盈餘分配 0%） |

**「當年盈餘 vs 以前年度盈餘」**：股利公告不分。只能單向推——盈餘分配 > 當年 EPS 時一定動用了以前年度盈餘；
≤ 時什麼都證明不了（bff-ts 量到只有約一成公司年度推得出）。但**不是完全沒有資料**：提列法定／特別盈餘公積、
現金股利、股票股利的實際發生數在 XBRL 權益變動表（mops-ts `equity_change_xbrl`，逐 RetainedEarningsMember／
LegalReserveMember／CapitalReserveMember 有期初、變動、期末），加上資產負債表的期末未分配盈餘，「期初未分配盈餘
→ 本期淨利 → 提列 → 可供分配」每一項都有來源，只是分散、而且是**帳上實際發生**，不是股東會的**決議**內容。
決議口徑的報表是 MOPS t05st09（股利分派情形－經股東會確認），mops-ts 還沒抓過。目前都沒接。

**同名不同口徑的地雷**：指標 `dividendPayoutRatio`（型錄名稱也叫盈餘發放率）用的是**現金流量表**的「發放現金股利」
÷ 近四季淨利。現金流量表那一行**包含公積發放**（實測 2882 國泰金 2023 年每股 1.024 元＝111 年度公積發放 0.9 元加特別股
股利），而且只有合計、拆不出來源，所以分子跟 `payoutRatio` 不同，文案已寫明。另外它還有「分子是付款年度、分母是
盈餘年度」的期間錯位（見 metricNarratives 的 dividendPayoutRatio）。兩者**不要互相驗證**。

## 五、改名追蹤表

狀態：已完成／並存中（新舊並存，到期後移除舊名）／待核准（等該服務的使用者核准）／待排程。

| 日期 | 服務 | 舊名 → 新名 | 狀態 |
|---|---|---|---|
| 2026-09-04 | twse、tpex、mops、gov、sitca | `stockCode`／`security_code` → `symbol` | 已完成（硬切） |
| 2026-09-04 | sitca（`FundExpenseRatioAnnual`） | `fund_id` → `fund_tax_id` | 已完成（硬切） |
| 2026-09-04 | tpex（`CompanyProfile`） | `market` → `source`（存的是上櫃／興櫃登記類別） | 已完成（硬切）。**10/10 起這一項本身變成落差**：市場族群的官方名是 `market`（MOPS TYPEK），`source` 只代表出處，要再拆一次 |
| 2026-09-04 | analysis（`BetaResult`） | `as_of_date` → `trade_date` | 已完成（硬切，表已刪） |
| 2026-09-25 | analysis（dividend-history） | `cashDividendFromCapitalReserve` → `cashDividendFromLegalReserveAndCapitalSurplus`（TIFRS `CapitalSurplus`） | 已完成 |
| 2026-10-10 | analysis（`GET /industries/{sectorCode}/monthly-revenue-history`） | `revenue`／`lastYearRevenue`／`yoyChangePercent` → `currentMonthRevenue`／`lastYearSameMonthRevenue`／`yoyChangePct` | 已完成（端點 10/09 才上線，不設並存期，`40058581`） |
| 2026-10-10 | mops（`market_monthly_revenue`，建表當天） | `last_month_revenue`／`last_year_cumulative_revenue` → `prev_month_revenue`／`cumulative_last_year_revenue` | 已完成（當時沒有讀取者） |
| — | mops | xbrl 各表 `year`（民國）→ `roc_year`；寬表 `report_date` → `fiscal_period_end_date`；418 個 XBRL 欄名照 `UBIQUITOUS_LANGUAGE_XBRL_COLUMNS.json`（第六節） | 待核准（mops 已核對對照表） |
| — | mops | 特別股表：先新增 `company_symbol`、`preferred_stock_symbol`，舊的 `symbol`（母公司）與 `preferred_stock_code` 並存 14 天後移除；之後再把 `preferred_stock_symbol` 改成 `symbol`（第二次並存）。同一個 view 不能同時有兩個意義不同的 `symbol`，所以分兩步 | 待核准 |
| — | mops | `company_profile.report_type`（中文）→ `data_type`：是值的轉換，不只是改名；mops 的規則是 export 只做投影，所以改在底表和 ingest | 待核准 |
| 2026-10-10 | twse | 上市月營收 2021-09～2026-07 刪除（當初從 MOPS _0 頁匯入、缺 -KY），只留 2026-08 起 OpenAPI 的月份；analysis 那些月份自動改由 mops 補 | DEV 已刪，PROD 待 twse 的使用者放行 |
| — | mops | view 改成 `export.v_<複數>`（例 `market_monthly_revenue` → `v_market_monthly_revenues`） | 待核准 |
| 2026-10-10 | tpex | 第一階段上 DEV（tpex 的使用者親自核准，fb18820）：company_profiles 加 market（otc／rotc）、data_type（MOPS 編碼）、generated_date、sector_code、listing_date、paid_in_capital_ntd；monthly_revenues 加 generated_date、sector_name、*_pct；industry_codes 加 sector_code／sector_name（14、16、17、20、33 已對齊 twse 名稱）；disposed／attention 加 announcement_date；ex_right_dividends 加 ex_dividend_date／ex_rights_date；foreign_shareholdings 加 *_pct。沒有讀者的 fs view 直接改名（generated_date、statement_format、market otc／rotc）。analysis 在 DEV 獨立驗證新舊欄 0 差異 | 並存中（DEV）；analysis 等 tpex 上 PRD 後改讀，14 天從 PRD 上線起算 |
| — | twse、tpex | `source`（市場族群）→ `market`；`financial_report_type` → `data_type`（MOPS 編碼）；`report_date` → `generated_date`；`industry` → `sector_code` 等（見第二節落差欄） | 待核准 |
| 2026-10-10 | analysis | 對外 API 批次 1（查詢參數 timeframe、西元 fiscalYear／fiscalQuarter，05967082）、2a（15 個 *Percent → *Pct、paidInShares → numberOfSharesIssued，8e3fe418）、2b（profile 的 generatedDate／sectorCode／sectorName／declaredDataType／listingDate／numberOfPreferenceShares，securities-sectors 的 sectorCode／sectorName，875ffaaf）、2c（financial-statement 西元年季與 fiscalPeriodEndDate、歷史與溯源的 timeframe、月營收 announcementDate／sectorName、質押 generatedDate，4cb5c4d6）、3（排序 order，含 GET /metrics 徽章 percentileRank.direction → order，810da900） | 並存中，舊名 2026-10-24 移除 |
| 2026-10-10 | analysis | 市場別步驟一：10 支端點回應新增 `marketCode`（sii／otc／rotc；興櫃由 isEmerging 併入），特別股清單 `marketType`（中文）→ `marketCode`；ETF 篩選的 market 篩選值兩種編碼都收 | 並存中，舊的 market／isEmerging／marketType 2026-10-24 移除 |
| 2026-10-24（排定） | analysis | 市場別步驟二：`market` 改用 TYPEK 值，`marketCode` 並存到 2026-11-07 | 待執行 |
| — | 業務中台、web-nuxt | `basis` → `timeframe`；型錄 `key`／`path` → `metricCode`；`name` → `companyName` 等 | 待排程（跟著 analysis） |

## 六、縮寫字典（PostgreSQL 63 字元上限用）

**規則**（2026-10-10 使用者：人工縮寫＋對照表，不用截斷加雜湊；同日 mops-ts 核對後定稿為第二版）：
0. **期間只看後綴**：明細表的 `_quarter`／`_ytd` 後綴是唯一的期間標示。元素名裡的期間字樣（`for_the_quarter_of`、`for_the_euarter_of`、`year_to_date`）一律拿掉。
   理由（mops-ts 實測）：`ShareOfProfitLossForTheQuarterOf…AuditedOrReviewedByOtherIndependentAccountants` 名稱叫 Quarter，contextRef 卻是年初累計。
1. 欄名＝元素名的 snake_case（同 mops `account_code`），明細表加 `_quarter`／`_ytd`。組合元素 `X-X`（成員名稱跟主元素重複）先收成 `X`。
2. **主名加後綴的總長度**超過 63 字元，才照下表**依序**套用，**一放得下就停**。同一個元素名，任何人縮出來都一樣。
3. 同一個元素不同維度（期初／期末、本期／前期）用「元素＋維度」，例 `equity_opening_balance`、`numerator_prior_period`。
4. 縮寫優先用 IFRS 慣用說法：fvoci、fvtpl、oci、ppe、ecl、ac（amortised cost）、own credit risk、held for sale。
   會看不出正負方向的縮寫不用（mops-ts 指出 `impairment_net` 不行，改用 `impairment_reversal_loss`，保留元素語序）。

**逐欄對照**：[`UBIQUITOUS_LANGUAGE_XBRL_COLUMNS.json`](UBIQUITOUS_LANGUAGE_XBRL_COLUMNS.json)，共 418 列，是 mops 自取或截斷的 XBRL 欄位。
- 每列附 `current_column`、`element`、`period_suffix`、`new_column`，以及用到哪幾條規則。
- 2026-10-10 實測：新欄名全部 ≤63 字元、同一張表內 0 撞名。
- 後綴 202 列由 mops 用 Prisma 欄位名補齊；3 列元素名由 mops 補完整。
- 對照表由規則產生，要改字典就重新產生整份，不手改單列。

**字典**（依序套用）：

| 順序 | 元素名片段 | 縮成 |
|---|---|---|
| 1 | `change_in_fair_value_of_financial_liability_attributable_to_change_in_credit_risk_of_liability` | `own_credit_risk_fv_change` |
| 2 | `reversal_of_impairment_loss_impairment_loss` | `impairment_reversal_loss` |
| 3 | `qualifying_for_cash_and_cash_equivalents_under_the_definition_of_ias7` | `cash_equivalents_ias7` |
| 4 | `securities_purchased_under_resell_agreements` | `reverse_repo` |
| 5 | `equivalent_issued_shares_of_advance_receipts_for_common_stock` | `shares_from_advance_receipts` |
| 6 | `attributable_to_former_owner_due_to_reorganization_of` | `former_owner_reorg_` |
| 7 | `in_accordance_with_the_agreement_that_exempted_from_reporting` | `exempted_by_agreement` |
| 8 | `in_accordance_with_debt_liquidation_program_and_restructuring_program` | `debt_restructuring_program` |
| 9 | `due_to_recognition_of_equity_component_of_convertible_bonds` | `equity_component_of_convertible_bonds` |
| 10 | `subsidiaries_joint_ventures_and_associates` | `subs_jv_assoc` |
| 11 | `noncurrent_assets_or_disposal_groups_classified_as_held_for_sale_and_discontinued_operations` | `held_for_sale_and_discontinued` |
| 12 | `other_equity_interest` | `other_equity` |
| 13 | `fair_value_through_other_comprehensive_income` | `fvoci` |
| 14 | `fair_value_through_profit_or_loss` | `fvtpl` |
| 15 | `other_comprehensive_income` | `oci` |
| 16 | `property_plant_and_equipment` | `ppe` |
| 17 | `accounted_for_using_equity_method` | `equity_method` |
| 18 | `associates_and_joint_ventures` | `assoc_jv` |
| 19 | `that_will_not_be_reclassified_to_profit_or_loss` | `not_reclassified_to_pl` |
| 20 | `that_will_be_reclassified_to_profit_or_loss` | `reclassified_to_pl` |
| 21 | `right_of_use_assets` | `rou_assets` |
| 22 | `investments_in_debt_instruments` | `debt_instrument_investments` |
| 23 | `investments_in_equity_instruments` | `equity_instrument_investments` |
| 24 | `exchange_differences_on_translation` | `translation_diff` |
| 25 | `expected_credit_losses` | `ecl` |
| 26 | `whose_financial_statements_were_audited_or_reviewed_by_other_independent_accountants` | `audited_by_others` |
| 27 | `whose_financial_statements_were_on_unaudited_or_unreviewed` | `unaudited` |
| 28 | `whose_financial_statements_were_unaudited_or_unreviewed` | `unaudited` |
| 29 | `designated_as_upon_initial_recognition` | `designated` |
| 30 | `incremental_costs_to_obtain_contract_with_customers` | `costs_to_obtain_contracts` |
| 31 | `disposal_groups_classified_as_held_for_sale` | `disposal_groups_held_for_sale` |
| 32 | `borrowed_securities_and_bonds_with_resale_agreements_short_sales` | `short_sales_borrowed_securities` |
| 33 | `in_accordance_with_ifrs9` | `ifrs9` |
| 34 | `determined_in_accordance_with` | `per` |
| 35 | `difference_between_consideration_and_carrying_amount` | `consideration_carrying_diff` |
| 36 | `current_portion_of_noncurrent` | `current_portion` |
| 37 | `defined_benefit_plans` | `db_plans` |
| 38 | `adjustments_for_change_in_value_of` | `adj_fv_change` |
| 39 | `due_from_the_central_bank` | `due_from_cb` |
| 40 | `call_loans_to_banks` | `call_loans` |
| 41 | `entities_under_common_control` | `common_control` |
| 42 | `subsidiaries_or_other_businesses` | `subs` |
| 43 | `financial_assets` | `fin_assets` |
| 44 | `financial_liabilities` | `fin_liab` |
| 45 | `financial_liability` | `fin_liab` |
| 46 | `financial_statements` | `fs` |
| 47 | `comprehensive_income` | `ci` |
| 48 | `non_controlling_interests` | `nci` |
| 49 | `attributable_to_owners_of_parent` | `attrib_to_parent` |
| 50 | `gains_losses` | `gl` |
| 51 | `gain_loss` | `gl` |
| 52 | `loss_gain` | `gl` |
| 53 | `profit_loss` | `pl` |
| 54 | `profit_or_loss` | `pl` |
| 55 | `impairment_loss` | `impairment` |
| 56 | `reversal_of_impairment` | `impairment_reversal` |
| 57 | `retrospective` | `retro` |
| 58 | `nonoperating_income_and_expenses` | `nonop` |
| 59 | `before_tax` | `pretax` |
| 60 | `income_tax_relating_to_components_of` | `tax_on` |
| 61 | `components_of` | `comp_of` |
| 62 | `classified_as_financing_activities` | `financing` |
| 63 | `classified_as_investing_activities` | `investing` |
| 64 | `classified_as_operating_activities` | `operating` |
| 65 | `commercial_papers` | `cp` |
| 66 | `subsidiaries` | `subs` |
| 67 | `acquired_or_disposed` | `acq_disp` |
| 68 | `derecognition` | `derecog` |
| 69 | `measured_at` | `at` |
| 70 | `increase_decrease` | `change` |
| 71 | `decrease_increase` | `change` |
| 72 | `recognised` | `recog` |
| 73 | `instruments` | `instr` |
| 74 | `investments` | `inv` |
| 75 | `liabilities` | `liab` |
| 76 | `accounts_receivable` | `ar` |
| 77 | `independent_accountants` | `cpa` |
| 78 | `discontinued_operations` | `discontinued` |
| 79 | `noncurrent` | `nc` |
| 80 | `finance_income_or_expenses` | `finance_income_expense` |
| 81 | `reinsurance_contracts_held` | `reinsurance_held` |
| 82 | `insurance_product_separated_account` | `separate_account` |
| 83 | `at_amortised_cost` | `at_ac` |
| 84 | `debt_instrument_inv` | `debt_inv` |
| 85 | `non_interest_income` | `nii` |
| 86 | `non_investment_linked` | `non_inv_linked` |
| 87 | `short_sales_borrowed_securities` | `short_sales` |
| 88 | `and_` | （拿掉） |
| 89 | `of_` | （拿掉） |

## 七、外部研究報告的落地檢核（濃縮）

[`Ubiquitous Language 建議報告.md`](Ubiquitous%20Language%20建議報告.md) 是 CRSP／Compustat／供應商慣例的參考資料，不是決策。逐節對照結果：

- **已對齊**：
  - 財報期末日和公告日分成兩個欄位：`fiscal_period_end_date`／`knowledgeDate`，查不到公告日時 `knowledgeDateIsFallback` 標記 look-ahead 風險。
  - `TTM`，從未使用 `LTM`。
  - 時點版本化：`metric_values` 以 `fiscalYear`＋`fiscalQuarter` 為有效時間、`knowledgeDate` 為知悉時間，`formulaVersion` 是算法版本。
  - 衍生指標用通用縮寫（`roe`、`eps`、`bvps`、`beta`）。
- **刻意不適用**：
  - 永久代理鍵（PERMNO）：台股 symbol 由主管機關配發、極少重用。
  - `last_price`：這個生態系永遠沒有盤中資料。
  - Fama-French 因子、指數成分股：不在平台範圍。
- **擱置**：價格調整三欄（`close_raw`、`close_split_adj`、`close_total_return_adj`）。目前每股數字換算到今天的股數基準（見 `docs/api-conventions.md`），股價不調整；真的需要報酬率序列時才引入。
- **籌碼**：外資「買賣超」要用 `foreignNet` 這類字眼，跟持股比例 `sharesHeldPercent` 分開；`sharesHeldPercent` 改名為 `*Pct` 時一併處理。

## 八、指標識別碼

- **`metricCode`**（camelCase）＋ **`timeframe`** 是指標在 API 上唯一的定址方式，欄位字串寫成 `metricCode.timeframe`（例 `roe.TTM`）。
  - 資料庫的 `metric_values` 把 timeframe 拆成 `period_type`／`lookback_range`／`sampling_interval`／`snapshot_cadence` 四欄（2026-09-08，舊的 `basis` 一欄已拆掉）。
- **`dependsOn`** 與溯源表的 `fieldKey`（溯源表項目的 `fieldKey` 就是這個意思；舊 filterCatalog 的 `metricKey.fieldKey` 已刪，`fieldKey` 現在只有這一種意思）：填 mops XBRL 的 `account_code`（元素名的 snake_case），不是自取的英文。非 XBRL 的輸入（例流通股數）用第二節的官方名稱。
- 舊的 filterCatalog（`metricKey.fieldKey`）已在 2026-09-08 整套刪除。業務中台與 web-nuxt 裡殘留的 `metricKey`／`fieldKey`／`Filter*` 是退役詞，見第二節。
