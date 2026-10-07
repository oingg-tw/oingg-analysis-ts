-- 2026-10-08 驗證上一個檔 NOT VALID 加上的 CHECK：掃舊列，只拿 SHARE UPDATE EXCLUSIVE，不擋讀寫。
ALTER TABLE "metric_values" VALIDATE CONSTRAINT "metric_values_period_type_check";
ALTER TABLE "metric_values" VALIDATE CONSTRAINT "metric_values_data_type_check";
ALTER TABLE "metric_values" VALIDATE CONSTRAINT "metric_values_null_reason_check";
ALTER TABLE "metric_daily_cadence_values" VALIDATE CONSTRAINT "metric_daily_cadence_values_data_type_check";
ALTER TABLE "metric_daily_cadence_values" VALIDATE CONSTRAINT "metric_daily_cadence_values_null_reason_check";
ALTER TABLE "metric_monthly_values" VALIDATE CONSTRAINT "metric_monthly_values_data_type_check";
ALTER TABLE "metric_monthly_values" VALIDATE CONSTRAINT "metric_monthly_values_null_reason_check";
