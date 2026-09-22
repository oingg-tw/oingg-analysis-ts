# 技術債列表

這份文件記錄目前已知、還沒解決的技術債跟資料缺口。跟 `UBIQUITOUS_LANGUAGE.md` 一樣是
持續維護的文件，不是一次性報告——項目解決後移到「已結案」或直接刪除並在對應 commit
訊息說明，新發現的項目隨時補進來。放在 repo 根目錄是同一個理由：跨服務協調時常常需要
引用，需要比 `docs/` 隨手筆記更高的持久性保證。

## 資料覆蓋率（最大宗，貫穿整個 pitMetrics 架構）

- **2026-09-11 更新：絕大多數季報型指標已經全市場回填**（`GENERAL_METRIC_CODES`/
  `BANK_METRIC_CODES`，~90 支 metricCode，2,058 家公司，0 錯誤，見
  `scripts/backfillAllMetricsLatestFullMarketPit.ts`）——含 Beta/MarketRatios
  （`exchangePeRatio`/`exchangePbRatio`/`dividendYield`）、2026-09-09 那批股東政策/
  成長動能指標、marketCap/ncav/grahamNumber/pegRatio、今天新增的即時版三支
  （`liveGrahamNumber`/`livePegRatio`/`liveMarketCap`）、「六季財報深度解鎖」17 支
  新指標，全部都已經是全市場覆蓋，不再是「只有 2330」的狀態。以下這條舊記錄已解決，
  不用再提。
- **歷史深度：真正的牆是 mops XBRL 從 109Q3 才鋪開，不是我們沒回填**（2026-09-22 兩次查證後的最終結論，
  當天稍早那版「是我們只回填到 113Q1」是錯的，已更正）。
  這批指標（`chowderNumber`/`oneDollarTest`/`epsCagr5y`/`epsCagr8y`/`revenueCagr5y`/`revenueCagr8y`/
  `dividendGrowthRate5y`/`dividendGrowthRate8y`/`consecutiveDividendYears`/`consecutiveProfitYears`）
  **每次計算都現查 mops 的財報表往回走年度，不讀我們自己算好的歷史列**——所以回填 `metric_values` 的
  季度範圍對它們完全沒有影響。
  實測上游各季有資料的公司數：109Q1=2、109Q2=47、**109Q3=1,352**、109Q4=51、110Q1=1,357、110Q2=1,406…
  「四季齊全」的年度數：109 年只有 1 家（2330）、110 年 1,353、111 年 1,373、112 年 1,393、113 年 1,405、114 年 1,785。
  → **多數公司的第一個完整會計年度是民國 110 年（2021）**，所以在 115Q2：5 年 CAGR 要 FY114 對 FY109，只有 2330 算得出來；
  `consecutiveDividendYears` 最多數到 110~114 共 5 年（web-nuxt 2026-09-22 量到 889 家並列 5，就是這條線）。
  **什麼時候自然解套**：115Q4 財報出來後（約 2027 年初）FY115 變完整年度，5 年 CAGR 變成 FY115 對 FY110，上千家會有值，
  連續年數上限變 6。8 年版本要等 FY118，或 mops 往前補 109Q3 以前的 XBRL（他們沒有排期）。
  **前端處置**：數字等於上限時語意是「至少 N 年」，兩支連續年數指標的 `limitations` 都已寫明；
  `/rank/consecutive-dividend-years` 這類排行榜在解套前沒有鑑別度（第 2~50 名全部並列 5），已告知 web-nuxt 自行處理。
- **109Q3–112Q4 全市場回填（進行中，價值是「歷史圖的深度」不是上面那條）**：`QUARTERS` 已延伸到 109Q3
  （commit 931cc5b6），跑完後 `GET /companies/metric-history` 之類的序列從只有 113Q1 起變成 109Q3 起，
  web-nuxt 的指標走勢圖才畫得出 2020~2023。進度見 `tmp/history-109-112.log`，腳本有逐公司續跑機制。

## 卡在其他微服務，等對方排期

- **股利分派公告表**（mops-ts `DividendDistribution` domain，資料源 MOPS t108sb27）：
  資料源本身沒有硬限制（沒有已知歷史年份上限），但 mops-ts 自己的 backfill CLI 缺
  公司層級跳過/續傳機制——這個 domain 設計是「一次查一整年」，2349 家公司全市場回補
  會是上萬次請求，中斷重跑目前補不了缺口。mops-ts 決定先補機制再執行，沒有排期。
  是「股利連續調升年數」「DPS CAGR」這類指標的前提，見
  [[reference_mops_dividend_distribution_dataset]]。
- **chip（籌碼）分類完全空白**：抓取架構已成熟（twse-ts `margin_balance` 每 30 分鐘
  輪詢，20 個 Cloud Scheduler job），但目前只有 10 個交易日歷史（2026-08-31 起才開始
  收），深度不夠做趨勢型指標（融資使用率、券資比、融資餘額變化率）。純粹等時間累積，
  不是誰的工作項。

## 已結案

- **ETF 折溢價指標**：2026-09-10 已完成——sitca-ts 開好 `export.fundclear_etf_nav_history`/
  `export.etf_closing_price` 兩個 view 後，直接在 `GET /etf-screener` 加了
  `premiumDiscountPct` 欄位（commit `d0df562`）。市價 push 仍在持續回填中（目前 331 檔
  ETF 裡 214 檔有值），且回溯深度比淨值淺（上市 2020-11 起、上櫃 2021-09 起）——這不是
  待辦事項，是這個欄位本身的資料特性，null 值代表「市價還沒回填到」，不是查詢失敗。
- **bff-ts `/stocks/:symbol/metrics-history` 疑似脆弱點**：2026-09-11 bff-ts 查證回覆，
  原本懷疑的「陣列位置對位合併」根本不存在——bff-ts 沒有自己的跨指標合併邏輯，
  `GET /companies/metrics-history` 回傳的就已經是合併好、用 `metricCode` 當 key、
  缺資料用 `null` 標記的單一陣列，bff-ts 只逐筆正規化欄位格式。之前 2026-09-09/10
  真正修的 500 是另一個問題（某 metricCode 某期完全無資料時回傳純 `null` 不是物件，
  bff-ts 對 `null` 取 `.value` 炸掉，commit `91e2bca` 已修好），跟陣列對位無關。已用
  2330 的 shareCountChangeRate/netIncomeGrowthRate 兩支成長型指標實測 23 期全部
  正常，無 500，結案。
- **`GET /industries/value-chain`：已結案，放棄**——tpex-ts 2026-09-11 確認不爭取
  `ic.tpex.org.tw` 的書面授權，資料源整個放棄，他們那邊已刪除 scraper/schema/表/
  export view（prod 那張表從頭到尾是空的，沒有資料遺失問題）。analysis-ts 這邊同步
  清掉所有相關程式碼（`src/models/industryValueChain.ts` 整支刪除，
  `industries/controller.ts`/`route.ts`/`openapi.ts`/`types.ts` 的相關函式/schema/
  註冊一併移除），不是繼續停用等待，是真的不存在了。
- **查核意見類型（`auditOpinionRisk`/`GET /companies/profile` 的欄位）：已結案，放棄**
  ——2026-09-11 全市場回填後發現季報（Q1/Q2）`qualified_opinion='Y'`（保留意見）比例
  高達 47~51.5%，年報是 0%，1101 等藍籌股顯示保留意見不合理。mops-ts 查證：不是
  parser bug，是核閱準則規定子公司範圍未個別核閱就要列保留結論（99.9% 相符
  `nonmajor_subsidiary_unaudited_flag`），是良性的程序性事項不是財報疑慮。使用者拍板
  整批放棄不修正，程式碼/已回填資料/metric_definitions 都已回滾清除，見
  [[project_audit_opinion_data_quality_doubt]]。

## 已知但非本服務造成的上游 bug

- **mops 季度資料越界問題**：查一季卻回兩季資料，已確認是 mops-ts 端的問題，已回報
  等對方查，見 [[project_mops_quarter_boundary_bug]]。
- **mops 單季現金流「上季累計有值、本季累計 null」38,425 筆**：2026-09-22 mops-ts 重推導
  整張單季表時留下的警告（維持存 null），方向跟他們剛修好的「一年只出現一次的科目被丟掉」
  相反、語意不明（公司不再列該行，或 parser 漏抓），他們之後另外查。不影響股利科目。

## 2026-09-22 當天新增的上下游約定（不是債，是查表用）

- **twse `company_profile` 有 `source` 欄位**：`COMPANY_PROFILE`（上市）vs `COMPANY_PROFILE_PUBLIC`
  （公開發行未上市，約 305 家）。公司目錄/類股一律 `WHERE source='COMPANY_PROFILE'`（commit e3590506），
  不要用碼數或 industry 啟發式。`monthly_revenue` 也是同一套 source。
- **每家公司只用一種財報口徑**：`ReportAvailabilityPort` 讀 mops `export.company_report_availability`，
  有合併報表用 `data_type='2'`、結構上只申報個體報表的 249 家用 `'1'`（commit 21fdd2d4）。新增讀
  metric_values 的 use case 不要寫死 '2'。
- **回填一律走 `memoizeStatementsForBackfill()`**（commit 82bff0a5）：三大表讀取記憶化，實測快約 3 倍；
  四支正式回填腳本＋`scripts/backfillTargetedPit.ts` 都已接上。新寫回填腳本記得在 main() 開頭呼叫。

