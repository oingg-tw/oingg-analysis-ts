-- CreateTable
CREATE TABLE "guru_piotroski_f_score" (
    "symbol" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "data_type" TEXT NOT NULL,
    "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
    "report_date" DATE,
    "score" DECIMAL(2,0),
    "positive_roa" BOOLEAN,
    "positive_cfo" BOOLEAN,
    "roa_improved" BOOLEAN,
    "accrual_quality" BOOLEAN,
    "leverage_decreased" BOOLEAN,
    "liquidity_improved" BOOLEAN,
    "no_dilution" BOOLEAN,
    "gross_margin_improved" BOOLEAN,
    "asset_turnover_improved" BOOLEAN,
    "prior_year" INTEGER,
    "prior_season" INTEGER,
    "prior_report_date" DATE,
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guru_piotroski_f_score_pkey" PRIMARY KEY ("symbol","year","season","data_type","subsidiary_company_id")
);
