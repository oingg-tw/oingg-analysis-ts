-- CreateTable
CREATE TABLE "cash_flow_fcf_yield" (
    "symbol" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "data_type" TEXT NOT NULL,
    "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
    "report_date" DATE,
    "fcf_yield_quarterly_annualized_pct" DECIMAL(10,2),
    "fcf_yield_ttm_pct" DECIMAL(10,2),
    "stock_price_value" DECIMAL(10,4),
    "stock_price_trade_date" DATE,
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_flow_fcf_yield_pkey" PRIMARY KEY ("symbol","year","season","data_type","subsidiary_company_id")
);

