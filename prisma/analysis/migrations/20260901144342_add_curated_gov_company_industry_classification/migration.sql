-- CreateTable
CREATE TABLE "curated_gov_company_industry_classification" (
    "stock_code" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "industry_code" TEXT NOT NULL,
    "source_industry_name" TEXT NOT NULL,
    "section_code" TEXT NOT NULL,
    "division_code" TEXT NOT NULL,
    "group_code" TEXT NOT NULL,
    "class_code" TEXT NOT NULL,
    "subclass_code" TEXT NOT NULL,
    "classification_name_zh" TEXT NOT NULL,
    "source_run_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curated_gov_company_industry_classification_pkey" PRIMARY KEY ("stock_code")
);
