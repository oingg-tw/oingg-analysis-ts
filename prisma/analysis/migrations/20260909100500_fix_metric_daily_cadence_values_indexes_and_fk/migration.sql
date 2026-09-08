-- 修正上一個 migration 的疏漏：只建了資料表 + CHECK 約束，漏了 @@unique/@@index，
-- FK 也沒有指定 ON DELETE/ON UPDATE 子句——用 `npx prisma migrate diff
-- --from-config-datasource --to-schema=prisma/analysis/schema.prisma --script`
-- 事後比對抓到（跟這個 session 一路驗證 migration 是否跟 schema.prisma 一致的
-- 慣例做法一樣）。這張表剛建立、還沒有任何應用程式碼在讀寫，用一個小的修正 migration
-- 補齊即可，不影響任何資料。

ALTER TABLE "metric_daily_cadence_values" DROP CONSTRAINT "metric_daily_cadence_values_metric_code_fkey";
ALTER TABLE "metric_daily_cadence_values" ADD CONSTRAINT "metric_daily_cadence_values_metric_code_fkey" FOREIGN KEY ("metric_code") REFERENCES "metric_definitions"("metric_code") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "metric_daily_cadence_values_identity_key" ON "metric_daily_cadence_values"("symbol", "metric_code", "lookback_range", "sampling_interval", "snapshot_cadence", "data_type", "subsidiary_company_id", "trade_date", "knowledge_date");
CREATE INDEX "metric_daily_cadence_values_latest_lookup" ON "metric_daily_cadence_values"("symbol", "metric_code", "lookback_range", "sampling_interval", "snapshot_cadence", "data_type", "subsidiary_company_id");
