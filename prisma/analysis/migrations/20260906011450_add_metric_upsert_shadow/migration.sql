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
CREATE INDEX "metric_upsert_shadow_model_name_captured_at_idx" ON "metric_upsert_shadow"("model_name", "captured_at");
