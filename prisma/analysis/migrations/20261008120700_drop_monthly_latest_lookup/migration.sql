-- 2026-10-08 metric_monthly_values_latest_lookup 是 identity 唯一索引的前綴、完全重複，每次寫入都要多維護一份。
DROP INDEX CONCURRENTLY IF EXISTS "metric_monthly_values_latest_lookup";
