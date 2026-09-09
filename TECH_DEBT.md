# 技術債列表

這份文件記錄目前已知、還沒解決的技術債跟資料缺口。跟 `UBIQUITOUS_LANGUAGE.md` 一樣是
持續維護的文件，不是一次性報告——項目解決後移到「已結案」或直接刪除並在對應 commit
訊息說明，新發現的項目隨時補進來。放在 repo 根目錄是同一個理由：跨服務協調時常常需要
引用，需要比 `docs/` 隨手筆記更高的持久性保證。

## 資料覆蓋率（最大宗，貫穿整個 pitMetrics 架構）

- **今天（2026-09-09）新增的股東政策/成長動能指標只回補了 2330**——`buybackYield`/
  `dividendCoverageRatio`/`shareCountChangeRate`/`revenueGrowthRate`/`epsGrowthRate`/
  `netIncomeGrowthRate`/`operatingIncomeGrowthRate`/`equityGrowthRate`/
  `bvpsGrowthRate`/`consecutiveDividendYears` 這 10 支都是「先做邏輯，資料不用全面」
  刻意的範圍限縮，只有 109Q4~115Q2（前 9 支）或最新一期（`consecutiveDividendYears`）。
  要變成真正能用的篩選/排行功能，需要全市場批次回填，目前完全沒有排期。
- **舊架構同樣問題更普遍**：多數 pitMetrics 只回填 3~6 家測試公司，全市場批次回填
  基礎設施不存在（見已結案的 `project_pit_migration_status` 記憶裡的評估：screener
  版替代方案曾評估過，結論是「查詢層架構可以做，但資料覆蓋率是更大的瓶頸，先不建」）。

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
- **`GET /industries/value-chain` 已下線**：tpex-ts 的 `export.company_industry_chain`
  資料源是 `ic.tpex.org.tw`，使用條款（disclaimer.php 第七條）要求轉載內容前需取得
  TPEx/TWSE 書面同意，目前還沒取得授權。端點程式碼保留（controller/service/types
  都不動，只關掉 route 註冊跟 OpenAPI 文件），等 tpex-ts 決定要不要爭取授權或放棄
  這個資料源。

## 已結案

- **ETF 折溢價指標**：2026-09-10 已完成——sitca-ts 開好 `export.fundclear_etf_nav_history`/
  `export.etf_closing_price` 兩個 view 後，直接在 `GET /etf-screener` 加了
  `premiumDiscountPct` 欄位（commit `d0df562`）。市價 push 仍在持續回填中（目前 331 檔
  ETF 裡 214 檔有值），且回溯深度比淨值淺（上市 2020-11 起、上櫃 2021-09 起）——這不是
  待辦事項，是這個欄位本身的資料特性，null 值代表「市價還沒回填到」，不是查詢失敗。

## 已知但非本服務造成的上游 bug

- **mops 季度資料越界問題**：查一季卻回兩季資料，已確認是 mops-ts 端的問題，已回報
  等對方查，見 [[project_mops_quarter_boundary_bug]]。

## 疑似脆弱點（今天發現，尚未證實/尚未修）

- **bff-ts `/stocks/:symbol/metrics-history` 的多指標合併邏輯疑似用陣列位置對位**，
  不是照 `metricCode` key 對應——2026-09-09 web-nuxt 回報不同指標回填進度不同步時
  （例如 `shareCountChangeRate` 只有 1 期、其他有 23 期）該端點 500。已直接測試過
  analysis-ts 自己的 `GET /companies/metrics-history` 在同樣長度不一致的情況下全部
  正常回 200（用 `null` 標記缺資料的期數），問題不在這裡。已請 bff-ts 查證他們自己
  的合併邏輯，這裡先記錄著——即使這次的具體案例已經靠回補資料繞過，類似的長度不一致
  情況以後還會發生，bff-ts 那邊的合併邏輯應該要加防護，不能假設所有 metricCode 回應
  長度一致。

## 文件本身的債

- `UBIQUITOUS_LANGUAGE.md` 「尚未解決的落差」那節提到 `metricKey`（filterCatalog）
  跟 `metric_code`（pitMetrics）曾經只是碰巧同名——filterCatalog 已經在 2026-09-08
  整套刪除（見 [[project_filtercatalog_sunset_plan]]），這條落差現在應該已經不存在，
  但那份文件沒有跟著更新。下次動 `UBIQUITOUS_LANGUAGE.md` 時應該一併移除或標記已結案。
