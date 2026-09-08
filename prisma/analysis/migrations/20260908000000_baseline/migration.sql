-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "reference_industry_code" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_industry_code_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "macro_equity_risk_premium" (
    "window_start" TEXT NOT NULL,
    "window_end" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "market_return_geometric" DECIMAL(8,4),
    "market_return_arithmetic" DECIMAL(8,4),
    "avg_risk_free_rate" DECIMAL(8,4),
    "erp_geometric" DECIMAL(8,4),
    "erp_arithmetic" DECIMAL(8,4),
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "macro_equity_risk_premium_pkey" PRIMARY KEY ("window_start","window_end")
);

-- CreateTable
CREATE TABLE "metric_definitions" (
    "metric_code" TEXT NOT NULL,
    "formula_note" TEXT NOT NULL,
    "allowed_bases" TEXT[],
    "depends_on" TEXT[],
    "current_formula_version" SMALLINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_definitions_pkey" PRIMARY KEY ("metric_code")
);

-- CreateTable
CREATE TABLE "metric_values" (
    "id" BIGSERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "metric_code" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "data_type" TEXT NOT NULL,
    "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
    "fiscal_year" SMALLINT NOT NULL,
    "fiscal_quarter" SMALLINT NOT NULL,
    "trade_date" DATE,
    "value" DECIMAL(24,6),
    "null_reason" TEXT,
    "knowledge_date" DATE NOT NULL,
    "knowledge_date_is_fallback" BOOLEAN NOT NULL,
    "formula_version" SMALLINT NOT NULL DEFAULT 1,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_upsert_shadow" (
    "id" BIGSERIAL NOT NULL,
    "model_name" TEXT NOT NULL,
    "primary_key" JSONB NOT NULL,
    "previous_row" JSONB NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_upsert_shadow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metric_values_latest_lookup" ON "metric_values"("symbol", "metric_code", "basis", "fiscal_year", "fiscal_quarter", "data_type", "subsidiary_company_id");

-- CreateIndex
CREATE UNIQUE INDEX "metric_values_identity_key" ON "metric_values"("symbol", "metric_code", "basis", "fiscal_year", "fiscal_quarter", "data_type", "subsidiary_company_id", "knowledge_date");

-- CreateIndex
CREATE INDEX "metric_upsert_shadow_model_name_captured_at_idx" ON "metric_upsert_shadow"("model_name", "captured_at");

-- AddForeignKey
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_metric_code_fkey" FOREIGN KEY ("metric_code") REFERENCES "metric_definitions"("metric_code") ON DELETE RESTRICT ON UPDATE CASCADE;

