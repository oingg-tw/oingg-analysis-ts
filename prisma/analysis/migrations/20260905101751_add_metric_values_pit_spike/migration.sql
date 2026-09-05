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
    "fiscal_quarter" SMALLINT,
    "value" DECIMAL(24,6),
    "null_reason" TEXT,
    "knowledge_date" DATE NOT NULL,
    "knowledge_date_is_fallback" BOOLEAN NOT NULL,
    "formula_version" SMALLINT NOT NULL DEFAULT 1,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metric_values_latest_lookup" ON "metric_values"("symbol", "metric_code", "basis", "fiscal_year", "fiscal_quarter", "data_type", "subsidiary_company_id");

-- CreateIndex
CREATE UNIQUE INDEX "metric_values_identity_key" ON "metric_values"("symbol", "metric_code", "basis", "fiscal_year", "fiscal_quarter", "data_type", "subsidiary_company_id", "knowledge_date");

-- AddForeignKey
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_metric_code_fkey" FOREIGN KEY ("metric_code") REFERENCES "metric_definitions"("metric_code") ON DELETE RESTRICT ON UPDATE CASCADE;
