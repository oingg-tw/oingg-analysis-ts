-- CreateTable
CREATE TABLE "guru_zmijewski_score" (
    "symbol" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "data_type" TEXT NOT NULL,
    "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
    "report_date" DATE,
    "x_score" DECIMAL(10,4),
    "probability_of_distress" DECIMAL(6,4),
    "flagged" BOOLEAN,
    "net_income_ttm_field_used" TEXT,
    "net_income_ttm_value" BIGINT,
    "total_assets_value" BIGINT,
    "total_liabilities_value" BIGINT,
    "current_assets_value" BIGINT,
    "current_liabilities_value" BIGINT,
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guru_zmijewski_score_pkey" PRIMARY KEY ("symbol","year","season","data_type","subsidiary_company_id")
);

-- CreateTable
CREATE TABLE "guru_ohlson_o_score" (
    "symbol" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "data_type" TEXT NOT NULL,
    "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
    "report_date" DATE,
    "o_score" DECIMAL(10,4),
    "probability_of_bankruptcy" DECIMAL(6,4),
    "flagged" BOOLEAN,
    "size" DECIMAL(14,4),
    "tlta" DECIMAL(14,4),
    "wcta" DECIMAL(14,4),
    "clca" DECIMAL(14,4),
    "oeneg" INTEGER,
    "nita" DECIMAL(14,4),
    "futl" DECIMAL(14,4),
    "intwo" INTEGER,
    "chin" DECIMAL(14,4),
    "net_income_ttm_value" BIGINT,
    "net_income_ttm_prior_year_value" BIGINT,
    "operating_cash_flow_ttm_value" BIGINT,
    "total_assets_value" BIGINT,
    "total_liabilities_value" BIGINT,
    "current_assets_value" BIGINT,
    "current_liabilities_value" BIGINT,
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guru_ohlson_o_score_pkey" PRIMARY KEY ("symbol","year","season","data_type","subsidiary_company_id")
);
