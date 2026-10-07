-- 2026-10-08 稽核表 captured_at 單欄索引（取代 (model_name, captured_at)，見 20261008120000）。
CREATE INDEX CONCURRENTLY IF NOT EXISTS "metric_upsert_shadow_captured_at_idx" ON "metric_upsert_shadow"("captured_at");
