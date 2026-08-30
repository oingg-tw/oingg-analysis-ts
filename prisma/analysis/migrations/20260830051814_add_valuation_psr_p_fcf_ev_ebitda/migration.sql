-- CreateTable
CREATE TABLE "valuation_psr" (
    "symbol" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "data_type" TEXT NOT NULL,
    "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
    "report_date" DATE,
    "psr_quarterly_annualized" DECIMAL(14,4),
    "psr_ttm" DECIMAL(14,4),
    "market_cap_value" DECIMAL(24,4),
    "market_cap_trade_date" DATE,
    "operating_revenue_value" BIGINT,
    "operating_revenue_ttm_value" BIGINT,
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valuation_psr_pkey" PRIMARY KEY ("symbol","year","season","data_type","subsidiary_company_id")
);

-- CreateTable
CREATE TABLE "valuation_p_fcf" (
    "symbol" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "data_type" TEXT NOT NULL,
    "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
    "report_date" DATE,
    "p_fcf_quarterly_annualized" DECIMAL(14,4),
    "p_fcf_ttm" DECIMAL(14,4),
    "market_cap_value" DECIMAL(24,4),
    "market_cap_trade_date" DATE,
    "free_cash_flow_value" BIGINT,
    "free_cash_flow_ttm_value" BIGINT,
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valuation_p_fcf_pkey" PRIMARY KEY ("symbol","year","season","data_type","subsidiary_company_id")
);

-- CreateTable
CREATE TABLE "valuation_ev_ebitda" (
    "symbol" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "data_type" TEXT NOT NULL,
    "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
    "report_date" DATE,
    "ev_to_ebitda_quarterly_annualized" DECIMAL(14,4),
    "ev_to_ebitda_ttm" DECIMAL(14,4),
    "enterprise_value" DECIMAL(24,4),
    "market_cap_value" DECIMAL(24,4),
    "market_cap_trade_date" DATE,
    "net_debt_value" BIGINT,
    "ebitda_quarterly_value" BIGINT,
    "ebitda_ttm_value" BIGINT,
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valuation_ev_ebitda_pkey" PRIMARY KEY ("symbol","year","season","data_type","subsidiary_company_id")
);

