-- metric_definitions 只是 metric_values/metric_daily_cadence_values 的 FK 錨點，欄位內容
-- 從來沒有被任何執行期程式碼查詢回來過——把四個 allowedXxx 陣列 + formula_note +
-- depends_on + current_formula_version 收斂成一個 spec JSONB 欄位，直接存整個
-- MetricDefinitionSpec，不用再維護「discriminated union ↔ DB 平面欄位」這層轉換
-- （legacyAllowedArrays()，已從程式碼刪除）。
--
-- 回填只需要「大致重建」，不用完美：group 依現有哪個陣列非空推導，allowedRollingWindowTokens
-- 目前 DB 裡沒有對應欄位（從未持久化過，見 metricDefinitionRegistry.ts 舊版註解），這裡填空
-- 陣列——下次任何 backfill 腳本/測試對這個 metricCode 重跑 upsertMetricDefinition() 就會
-- 自動覆寫成完整正確的 spec（beta 目前是唯一的 rollingWindow metricCode，這批舊資料的
-- allowedRollingWindowTokens 缺口只在人工直接查詢這張表時看得到，不影響任何執行期行為）。

-- ============================================================
-- 加 nullable 欄位
-- ============================================================
ALTER TABLE "metric_definitions" ADD COLUMN "spec" JSONB;

-- ============================================================
-- 依現有欄位回填
-- ============================================================
UPDATE "metric_definitions"
SET "spec" = jsonb_build_object(
  'metricCode', "metric_code",
  'displayName', "metric_code",
  'unit', '',
  'formulaNote', "formula_note",
  'group', CASE
    WHEN "allowed_period_types" <> '{}' THEN 'period'
    WHEN "allowed_lookback_ranges" <> '{}' THEN 'rollingWindow'
    WHEN "allowed_snapshot_cadences" <> '{}' THEN 'snapshot'
    ELSE 'period'
  END,
  'allowedPeriodTypes', to_jsonb("allowed_period_types"),
  'allowedLookbackRanges', to_jsonb("allowed_lookback_ranges"),
  'allowedSamplingIntervals', to_jsonb("allowed_sampling_intervals"),
  'allowedSnapshotCadences', to_jsonb("allowed_snapshot_cadences"),
  'allowedRollingWindowTokens', '[]'::jsonb,
  'dependsOn', to_jsonb("depends_on"),
  'currentFormulaVersion', "current_formula_version"
);

-- ============================================================
-- 斷言：回填完成後不應該有任何 NULL
-- ============================================================
DO $$
DECLARE null_spec_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO null_spec_count FROM "metric_definitions" WHERE "spec" IS NULL;
  IF null_spec_count <> 0 THEN
    RAISE EXCEPTION 'metric_definitions 有 % 筆列回填 spec 失敗', null_spec_count;
  END IF;
END $$;

-- ============================================================
-- SET NOT NULL，砍舊欄位
-- ============================================================
ALTER TABLE "metric_definitions" ALTER COLUMN "spec" SET NOT NULL;

ALTER TABLE "metric_definitions"
  DROP COLUMN "formula_note",
  DROP COLUMN "allowed_period_types",
  DROP COLUMN "allowed_lookback_ranges",
  DROP COLUMN "allowed_sampling_intervals",
  DROP COLUMN "allowed_snapshot_cadences",
  DROP COLUMN "depends_on",
  DROP COLUMN "current_formula_version";
