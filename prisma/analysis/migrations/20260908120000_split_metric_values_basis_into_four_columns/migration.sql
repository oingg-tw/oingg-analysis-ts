-- 手動改寫（不是 `prisma migrate diff` 直接產生的版本）——`metric_values` 這張表已有 ~9,700
-- 筆真實資料，Prisma 產生的粗略 diff 是直接 `DROP COLUMN "basis"` + `ADD COLUMN ... NOT NULL`
-- （沒有預設值），對已有資料的表會直接失敗。這裡改成標準的安全多階段順序：先加 nullable 欄位
-- →用 CASE 依現有 basis 值分流回填→SET NOT NULL→砍舊的 constraint/index→建新的。
--
-- 背景：`basis` 欄位塞了三組語意完全不同的概念（季報聚合方式/Beta 滾動視窗/純市場快照），
-- 違反 ubiquitous language（「basis」是會計保留用語），拆成四個正交欄位：periodType（季報
-- 聚合方式）、lookbackRange+samplingInterval（Beta 的回溯範圍×取樣粒度，正交拆開不是複合
-- enum）、snapshotCadence（純市場快照）。四欄都是 NOT NULL + 'N/A' sentinel，不是 nullable
-- ——沿用這個 repo 這次 session 稍早 fiscalQuarter 的教訓：Postgres UNIQUE 約束把 NULL 視為
-- 互不相等，nullable 欄位放進複合唯一鍵會讓去重保護失效。完整設計記錄見
-- abstract-crafting-journal.md。

-- ============================================================
-- metric_values：新增四個 nullable 欄位
-- ============================================================
ALTER TABLE "metric_values"
  ADD COLUMN "period_type" TEXT,
  ADD COLUMN "lookback_range" TEXT,
  ADD COLUMN "sampling_interval" TEXT,
  ADD COLUMN "snapshot_cadence" TEXT;

-- ============================================================
-- 依現有 basis 值分流回填（舊值→新值對照，見 abstract-crafting-journal.md）：
--   Q→periodType Q；Q_ANN→periodType Q_ANN；TTM→periodType TTM；CUM→periodType YTD（國際
--   標準 YTD 取代東亞地區慣例 CUM）；FY→periodType FY；1Y_DAILY→lookbackRange 1Y +
--   samplingInterval 1D；2Y_WEEKLY→2Y+1W；5Y_MONTHLY→5Y+1M；DAILY→snapshotCadence EOD。
--   非本組的欄位一律填 'N/A' sentinel。任何不在這 9 種已知值內的 basis（理論上不該存在）
--   會讓四欄全部落到 ELSE 分支的 'N/A'，不會讓 migration 中途失敗，但也不會是正確的資料——
--   下面驗證步驟會檢查有沒有這種「四欄全 N/A」的異常列。
-- ============================================================
UPDATE "metric_values"
SET
  "period_type" = CASE "basis"
    WHEN 'Q' THEN 'Q'
    WHEN 'Q_ANN' THEN 'Q_ANN'
    WHEN 'TTM' THEN 'TTM'
    WHEN 'CUM' THEN 'YTD'
    WHEN 'FY' THEN 'FY'
    ELSE 'N/A'
  END,
  "lookback_range" = CASE "basis"
    WHEN '1Y_DAILY' THEN '1Y'
    WHEN '2Y_WEEKLY' THEN '2Y'
    WHEN '5Y_MONTHLY' THEN '5Y'
    ELSE 'N/A'
  END,
  "sampling_interval" = CASE "basis"
    WHEN '1Y_DAILY' THEN '1D'
    WHEN '2Y_WEEKLY' THEN '1W'
    WHEN '5Y_MONTHLY' THEN '1M'
    ELSE 'N/A'
  END,
  "snapshot_cadence" = CASE "basis"
    WHEN 'DAILY' THEN 'EOD'
    ELSE 'N/A'
  END;

-- ============================================================
-- SET NOT NULL（回填完成後，四欄應該已經沒有任何 NULL）
-- ============================================================
ALTER TABLE "metric_values"
  ALTER COLUMN "period_type" SET NOT NULL,
  ALTER COLUMN "lookback_range" SET NOT NULL,
  ALTER COLUMN "sampling_interval" SET NOT NULL,
  ALTER COLUMN "snapshot_cadence" SET NOT NULL;

-- ============================================================
-- 砍舊的 constraint/index（先砍唯一鍵，因為它依賴 basis 欄位）、砍 basis 欄位、建新的
-- ============================================================
DROP INDEX IF EXISTS "metric_values_identity_key";
DROP INDEX IF EXISTS "metric_values_latest_lookup";

ALTER TABLE "metric_values" DROP COLUMN "basis";

CREATE INDEX "metric_values_latest_lookup" ON "metric_values"("symbol", "metric_code", "period_type", "lookback_range", "sampling_interval", "snapshot_cadence", "fiscal_year", "fiscal_quarter", "data_type", "subsidiary_company_id");

CREATE UNIQUE INDEX "metric_values_identity_key" ON "metric_values"("symbol", "metric_code", "period_type", "lookback_range", "sampling_interval", "snapshot_cadence", "fiscal_year", "fiscal_quarter", "data_type", "subsidiary_company_id", "knowledge_date");

-- ============================================================
-- metric_definitions：`allowed_bases` 換成四個陣列欄位。這張表在應用程式碼裡是「寫入端
-- 參考記錄」（upsertMetricDefinition 寫入，backfill 腳本/測試各自的 beforeAll 呼叫）——
-- 驗證 writeMetricValue() 合法性用的是記憶體內的 metricDefinitionRegistry 靜態物件（見
-- metricValueWriter.ts:89），沒有任何執行期程式碼會查詢這張表（grep 驗證過，`src/` 底下
-- 沒有任何 metricDefinition.findMany/findUnique/findFirst）。所以這裡不需要對舊
-- allowed_bases 值做精確的 CASE 回填——四個新陣列欄位直接給空陣列預設值即可，下次任何
-- backfill 腳本或測試重跑 upsertMetricDefinition() 時會自然覆寫成正確值，不影響任何現有
-- 執行期行為。
-- ============================================================
ALTER TABLE "metric_definitions"
  ADD COLUMN "allowed_period_types" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "allowed_lookback_ranges" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "allowed_sampling_intervals" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "allowed_snapshot_cadences" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "metric_definitions" DROP COLUMN "allowed_bases";
