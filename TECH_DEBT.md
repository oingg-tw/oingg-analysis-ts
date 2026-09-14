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
- **真正的資料覆蓋率缺口，改成結構性的「深度不夠」而不是「範圍沒做」**：
  `chowderNumber`/`pegRatio`/`livePegRatio`/`epsCagr3y`/`epsCagr5y`/`epsCagr8y`/
  `revenueCagr3y`/`revenueCagr5y`/`revenueCagr8y`/`dividendGrowthRate3y`/
  `dividendGrowthRate5y`/`dividendGrowthRate8y` 這批需要 ≥3 年（≥12 季）歷史回溯的
  指標，全市場已回填但實測非 null 比例偏低——mops-ts 的 XBRL 全市場覆蓋實際是從
  114Q1（2025）才開始鋪開，深度還在逐步累積。不是誰的 bug，純粹是上游資料庫歷史
  深度還沒累積到，沒有排期，等 mops-ts 之後往回補歷史年度的 XBRL 才會自然解決。
  **2026-09-14 實測進度**（對照 2026-09-11 舊快照的 1~2/2058）：3 年版本已經有
  實質進展——`epsCagr3y` 33/2067、`revenueCagr3y` 138/2067；但 5 年/8 年版本
  （`epsCagr5y`/`8y`、`revenueCagr5y`/`8y`、`dividendGrowthRate5y`/`8y`）跟
  `chowderNumber`/`pegRatio`/`livePegRatio`（`livePegRatio` 內部邏輯依賴 5 年年度
  EPS，實測 `metric_daily_cadence_values` 裡 1781 家有列但只有 1 家非 null，同一種
  深度限制）幾乎沒動，仍是 0~1。深度還是不夠，只是 3 年版本比 5/8 年版本先解套，
  之後可以再抽查一次確認趨勢。
  （⚠️ 查這批指標時要注意 `livePegRatio` 是逐日型 snapshotCadence='EOD'，寫進
  `metric_daily_cadence_values`，不是 `metric_values`——2026-09-14 曾經查錯表誤判
  成「完全沒資料」，已更正。）

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

