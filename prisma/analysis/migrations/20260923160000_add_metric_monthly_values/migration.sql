-- 2026-09-23：月頻指標的獨立表（第一支是 sus，標準化未預期營收）。
--
-- 為什麼開新表而不是動 metric_values：那張表的期間座標是 (fiscal_year, fiscal_quarter)，沒有月份。
-- 硬塞的話同一季的三個月共用同一個座標，唯一鍵與 latest_lookup 會把它們當成同一期——findLatest 只看得到
-- 最後公告的那個月、歷史查詢把三個月摺成一筆。那正是 2026-09-09 逐日型指標拆表的原因（見
-- 20260909100000_split_daily_cadence_metrics_into_own_table）。
-- 也不塞進 metric_daily_cadence_values：那張表的鍵叫 trade_date（營收月份不是交易日），而且它假設
-- 「逐日型指標沒有公告延遲，knowledge_date 恆等於 trade_date」——月營收次月才公告，放進去等於謊報
-- knowledge_date，回測會穿越未來。
-- 也不在 metric_values 加欄位：實測該表 610 萬列 1.65 GB，月座標必須進唯一鍵與 latest_lookup，
-- 等於重建 446MB + 409MB 兩個索引。新表對既有資料零風險。
--
-- 這份是手寫的（`prisma migrate dev` 一律不跑，它會把 schema.prisma 沒宣告的手寫 CHECK 約束產生成
-- DROP CONSTRAINT；流程見 schema.prisma 的 MetricDailyCadenceValue 檔頭）。已用
-- `prisma migrate diff --from-config-datasource --to-schema` 產參考，確認產出只有 CREATE、沒有任何 DROP。

CREATE TABLE "metric_monthly_values" (
    "id" BIGSERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "metric_code" TEXT NOT NULL,
    "data_type" TEXT NOT NULL,
    "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
    "fiscal_year" SMALLINT NOT NULL,
    "fiscal_month" SMALLINT NOT NULL,
    "value" DECIMAL(24,6),
    "null_reason" TEXT,
    "knowledge_date" DATE NOT NULL,
    "knowledge_date_is_fallback" BOOLEAN NOT NULL,
    "formula_version" SMALLINT NOT NULL DEFAULT 1,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "metric_monthly_values_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "metric_monthly_values_latest_lookup" ON "metric_monthly_values"("symbol", "metric_code", "fiscal_year", "fiscal_month", "data_type", "subsidiary_company_id");

CREATE UNIQUE INDEX "metric_monthly_values_identity_key" ON "metric_monthly_values"("symbol", "metric_code", "fiscal_year", "fiscal_month", "data_type", "subsidiary_company_id", "knowledge_date");

ALTER TABLE "metric_monthly_values" ADD CONSTRAINT "metric_monthly_values_metric_code_fkey" FOREIGN KEY ("metric_code") REFERENCES "metric_definitions"("metric_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- fiscal_month 只能是 1~12 的真實月份，**沒有 sentinel 值**（這張表只有一種座標形狀，不像
-- metric_values 早期需要用 0 冒充季度）。應用層的 validateCoordinate 已經擋一次，這裡是 DB 層的第二道
-- ——寫入路徑不只一條（回填腳本、批次、未來可能的補寫工具），守在 schema 才是真的守住。
-- 跟 metric_daily_cadence_values_coordinate_check 一樣是手寫約束，**不會出現在 schema.prisma 裡**。
ALTER TABLE "metric_monthly_values" ADD CONSTRAINT "metric_monthly_values_fiscal_month_check" CHECK ("fiscal_month" BETWEEN 1 AND 12);
