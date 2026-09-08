-- 把逐日型指標（Beta/exchangePeRatio/exchangePbRatio/dividendYield，
-- coordinate_kind IN ('ROLLING_WINDOW','SNAPSHOT')）從 metric_values 搬到獨立的
-- metric_daily_cadence_values，metric_values 縮回純季報型長表。完整脈絡見
-- abstract-crafting-journal.md——根因是 queryMetricHistory.ts 的歷史查詢對逐日型
-- 指標會把一整年資料誤判成同一期（fiscal_quarter 恆為 sentinel 0），遺失 99%+ 資料。
--
-- 全部包在單一交易內完成，用 DO block 斷言做完整性檢查——任何一個斷言失敗都會讓整個
-- migration 原子性失敗，不會留下部分完成的壞狀態。

-- ============================================================
-- 1. 建新表 + CHECK 約束
-- ============================================================
CREATE TABLE "metric_daily_cadence_values" (
  "id" BIGSERIAL PRIMARY KEY,
  "symbol" TEXT NOT NULL,
  "metric_code" TEXT NOT NULL,
  "lookback_range" TEXT NOT NULL,
  "sampling_interval" TEXT NOT NULL,
  "snapshot_cadence" TEXT NOT NULL,
  "data_type" TEXT NOT NULL,
  "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
  "trade_date" DATE NOT NULL,
  "value" DECIMAL(24,6),
  "null_reason" TEXT,
  "knowledge_date" DATE NOT NULL,
  "knowledge_date_is_fallback" BOOLEAN NOT NULL,
  "formula_version" SMALLINT NOT NULL DEFAULT 1,
  "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_daily_cadence_values_metric_code_fkey" FOREIGN KEY ("metric_code") REFERENCES "metric_definitions"("metric_code")
);

ALTER TABLE "metric_daily_cadence_values" ADD CONSTRAINT "metric_daily_cadence_values_coordinate_check" CHECK (
  ("lookback_range" <> 'N/A' AND "sampling_interval" <> 'N/A' AND "snapshot_cadence" = 'N/A')
  OR ("lookback_range" = 'N/A' AND "sampling_interval" = 'N/A' AND "snapshot_cadence" <> 'N/A')
);

-- ============================================================
-- 2. 斷言：即將搬移的列全部有 trade_date（不應該相信新表 NOT NULL 一定套得上，先驗證）
-- ============================================================
DO $$
DECLARE null_trade_date_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO null_trade_date_count FROM "metric_values"
    WHERE "coordinate_kind" IN ('ROLLING_WINDOW', 'SNAPSHOT') AND "trade_date" IS NULL;
  IF null_trade_date_count <> 0 THEN
    RAISE EXCEPTION 'metric_values 裡有 % 筆 ROLLING_WINDOW/SNAPSHOT 列缺 trade_date，無法安全搬移到 NOT NULL 的新表', null_trade_date_count;
  END IF;
END $$;

-- ============================================================
-- 3. 搬移資料
-- ============================================================
INSERT INTO "metric_daily_cadence_values"
  ("symbol", "metric_code", "lookback_range", "sampling_interval", "snapshot_cadence", "data_type", "subsidiary_company_id", "trade_date", "value", "null_reason", "knowledge_date", "knowledge_date_is_fallback", "formula_version", "computed_at")
SELECT
  "symbol", "metric_code", "lookback_range", "sampling_interval", "snapshot_cadence", "data_type", "subsidiary_company_id", "trade_date", "value", "null_reason", "knowledge_date", "knowledge_date_is_fallback", "formula_version", "computed_at"
FROM "metric_values"
WHERE "coordinate_kind" IN ('ROLLING_WINDOW', 'SNAPSHOT');

-- ============================================================
-- 4. 斷言：搬移後列數一致
-- ============================================================
DO $$
DECLARE source_count BIGINT;
DECLARE dest_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO source_count FROM "metric_values" WHERE "coordinate_kind" IN ('ROLLING_WINDOW', 'SNAPSHOT');
  SELECT COUNT(*) INTO dest_count FROM "metric_daily_cadence_values";
  IF source_count <> dest_count THEN
    RAISE EXCEPTION '搬移列數不一致：來源 % 筆，新表 % 筆', source_count, dest_count;
  END IF;
END $$;

-- ============================================================
-- 5. 刪除已搬移的來源列
-- ============================================================
DELETE FROM "metric_values" WHERE "coordinate_kind" IN ('ROLLING_WINDOW', 'SNAPSHOT');

-- ============================================================
-- 6. 斷言：刪除後剩下的列（全部是 PERIOD）不應該有任何 trade_date
-- ============================================================
DO $$
DECLARE leftover_trade_date_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO leftover_trade_date_count FROM "metric_values" WHERE "trade_date" IS NOT NULL;
  IF leftover_trade_date_count <> 0 THEN
    RAISE EXCEPTION 'metric_values 刪除 ROLLING_WINDOW/SNAPSHOT 列之後，仍有 % 筆列帶 trade_date，不符合「剩下的都是純季報型」假設', leftover_trade_date_count;
  END IF;
END $$;

-- ============================================================
-- 7. metric_values 縮回純季報型形狀：砍舊 CHECK/索引/欄位，重建縮小後的索引
-- ============================================================
ALTER TABLE "metric_values" DROP CONSTRAINT "metric_values_coordinate_kind_check";

DROP INDEX "metric_values_identity_key";
DROP INDEX "metric_values_latest_lookup";

ALTER TABLE "metric_values"
  DROP COLUMN "lookback_range",
  DROP COLUMN "sampling_interval",
  DROP COLUMN "snapshot_cadence",
  DROP COLUMN "coordinate_kind",
  DROP COLUMN "trade_date";

CREATE UNIQUE INDEX "metric_values_identity_key" ON "metric_values"("symbol", "metric_code", "period_type", "fiscal_year", "fiscal_quarter", "data_type", "subsidiary_company_id", "knowledge_date");
CREATE INDEX "metric_values_latest_lookup" ON "metric_values"("symbol", "metric_code", "period_type", "fiscal_year", "fiscal_quarter", "data_type", "subsidiary_company_id");
