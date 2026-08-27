-- CreateTable
CREATE TABLE "guru_altman_z_score" (
    "symbol" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "data_type" TEXT NOT NULL,
    "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
    "report_date" DATE,
    "z_score" DECIMAL(10,4),
    "x1" DECIMAL(14,6),
    "x2" DECIMAL(14,6),
    "x3" DECIMAL(14,6),
    "x4" DECIMAL(14,6),
    "x5" DECIMAL(14,6),
    "market_cap_value" DECIMAL(24,4),
    "market_cap_trade_date" DATE,
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guru_altman_z_score_pkey" PRIMARY KEY ("symbol","year","season","data_type","subsidiary_company_id")
);
