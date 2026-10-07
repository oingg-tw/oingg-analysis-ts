-- 2026-10-08 照 PostgreSQL 指南調整，這個檔是需要排他鎖的部分，全部都只改中繼資料、不重寫表，鎖拿到就是瞬間的事。
-- lock_timeout 3 秒：背景回填正在寫的話拿不到鎖就整個檔失敗（Prisma 一次送出整份，是同一個交易），
-- `prisma migrate resolve --rolled-back <這個資料夾名>` 之後重跑即可，不會卡住線上寫入。
SET lock_timeout = '3s';

-- 1. 時間欄位 timestamp(3) → timestamptz(3)。PostgreSQL 12 起，連線時區是 UTC 且不寫 USING 時只改中繼資料、不重寫表
--    （既有值本來就是 UTC 寫進去的，換型別後代表的時間點不變）。
SET TimeZone = 'UTC';
ALTER TABLE "reference_industry_code" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "macro_equity_risk_premium" ALTER COLUMN "computed_at" SET DATA TYPE TIMESTAMPTZ(3), ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "metric_definitions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3), ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "metric_values" ALTER COLUMN "computed_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "metric_daily_cadence_values" ALTER COLUMN "computed_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "metric_monthly_values" ALTER COLUMN "computed_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "metric_upsert_shadow" ALTER COLUMN "captured_at" SET DATA TYPE TIMESTAMPTZ(3);

-- 2. 編碼欄位的 CHECK（值清單照 src/domain/metrics/metricBasis.ts；套用前已查過 DEV 三張表現有值都在清單內）。
--    先 NOT VALID（只擋新寫入、不掃舊列），下一個檔再 VALIDATE（只拿輕鎖）。逐日表沒有 period_type 欄位。
--    Prisma schema DSL 不支援 @@check，這些約束不會出現在 schema.prisma——不要跑 `prisma migrate dev`，見 schema.prisma 的說明。
ALTER TABLE "metric_values"
  ADD CONSTRAINT "metric_values_period_type_check" CHECK ("period_type" IN ('N/A', 'Q', 'YTD', 'TTM', 'FY')) NOT VALID,
  ADD CONSTRAINT "metric_values_data_type_check" CHECK ("data_type" IN ('1', '2')) NOT VALID,
  ADD CONSTRAINT "metric_values_null_reason_check" CHECK ("null_reason" IN ('missing_input', 'zero_or_negative_denominator', 'not_applicable_industry', 'insufficient_history')) NOT VALID;
ALTER TABLE "metric_daily_cadence_values"
  ADD CONSTRAINT "metric_daily_cadence_values_data_type_check" CHECK ("data_type" IN ('1', '2')) NOT VALID,
  ADD CONSTRAINT "metric_daily_cadence_values_null_reason_check" CHECK ("null_reason" IN ('missing_input', 'zero_or_negative_denominator', 'not_applicable_industry', 'insufficient_history')) NOT VALID;
ALTER TABLE "metric_monthly_values"
  ADD CONSTRAINT "metric_monthly_values_data_type_check" CHECK ("data_type" IN ('1', '2')) NOT VALID,
  ADD CONSTRAINT "metric_monthly_values_null_reason_check" CHECK ("null_reason" IN ('missing_input', 'zero_or_negative_denominator', 'not_applicable_industry', 'insufficient_history')) NOT VALID;

-- 3. 大表的 autovacuum 門檻：預設 0.2 在 900 萬列的 metric_values 要累積約 180 萬筆死列才清；回填是大量 UPDATE。只改表設定、不重寫。
ALTER TABLE "metric_values" SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE "metric_upsert_shadow" SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);

-- 4. 慢查詢事後追查用（Neon 已預載，只需要建 extension）。
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 5. 三張單數名稱的表改複數（使用者 2026-10-08 拍板，跟其他服務一致）；主鍵／CHECK 名稱一起改成 Prisma 預設的 <表名>_pkey。
ALTER TABLE "reference_industry_code" RENAME TO "reference_industry_codes";
ALTER TABLE "reference_industry_codes" RENAME CONSTRAINT "reference_industry_code_pkey" TO "reference_industry_codes_pkey";
ALTER TABLE "macro_equity_risk_premium" RENAME TO "macro_equity_risk_premiums";
ALTER TABLE "macro_equity_risk_premiums" RENAME CONSTRAINT "macro_equity_risk_premium_pkey" TO "macro_equity_risk_premiums_pkey";
ALTER TABLE "upstream_processor_lease" RENAME TO "upstream_processor_leases";
ALTER TABLE "upstream_processor_leases" RENAME CONSTRAINT "upstream_processor_lease_pkey" TO "upstream_processor_leases_pkey";
ALTER TABLE "upstream_processor_leases" RENAME CONSTRAINT "upstream_processor_lease_single_row" TO "upstream_processor_leases_single_row";
