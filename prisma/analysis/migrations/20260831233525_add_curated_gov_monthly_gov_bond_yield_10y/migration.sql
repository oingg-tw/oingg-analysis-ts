-- CreateTable
CREATE TABLE "curated_gov_monthly_gov_bond_yield_10y" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "yield_rate" DECIMAL(8,4) NOT NULL,
    "source_run_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curated_gov_monthly_gov_bond_yield_10y_pkey" PRIMARY KEY ("year","month")
);

