-- CreateTable
CREATE TABLE "sync_state" (
    "backend" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "last_run_id" TEXT,
    "last_completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("backend","dataset")
);

-- CreateTable
CREATE TABLE "curated_mops_quarterly_income_statement" (
    "symbol" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "data_type" TEXT NOT NULL,
    "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
    "report_date" DATE NOT NULL,
    "operating_revenue" BIGINT,
    "gross_profit" BIGINT,
    "operating_income" BIGINT,
    "profit_before_tax" BIGINT,
    "net_income" BIGINT,
    "eps" DECIMAL(10,2),
    "admin_expenses" BIGINT,
    "comprehensive_income_attributable_to_nci" BIGINT,
    "comprehensive_income_attributable_to_parent" BIGINT,
    "eps_diluted" DECIMAL(10,2),
    "finance_costs" BIGINT,
    "gross_profit_before_adjustment" BIGINT,
    "income_tax_expense" BIGINT,
    "interest_income" BIGINT,
    "net_income_attributable_to_nci" BIGINT,
    "net_income_attributable_to_parent" BIGINT,
    "net_income_from_continuing_ops" BIGINT,
    "non_operating_income_expenses" BIGINT,
    "operating_cost" BIGINT,
    "operating_expenses" BIGINT,
    "other_comprehensive_income" BIGINT,
    "other_income" BIGINT,
    "other_non_operating_gains_losses" BIGINT,
    "other_operating_gains_losses" BIGINT,
    "rd_expenses" BIGINT,
    "selling_expenses" BIGINT,
    "share_of_associates_jv_profit" BIGINT,
    "total_comprehensive_income" BIGINT,
    "source_run_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curated_mops_quarterly_income_statement_pkey" PRIMARY KEY ("symbol","year","quarter","data_type","subsidiary_company_id")
);

