-- CreateTable
CREATE TABLE "guru_beneish_m_score" (
    "symbol" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "data_type" TEXT NOT NULL,
    "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
    "report_date" DATE,
    "m_score" DECIMAL(10,4),
    "dsri" DECIMAL(14,4),
    "gmi" DECIMAL(14,4),
    "aqi" DECIMAL(14,4),
    "sgi" DECIMAL(14,4),
    "depi" DECIMAL(14,4),
    "sgai" DECIMAL(14,4),
    "tata" DECIMAL(14,4),
    "lvgi" DECIMAL(14,4),
    "prior_year" INTEGER,
    "prior_season" INTEGER,
    "prior_report_date" DATE,
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guru_beneish_m_score_pkey" PRIMARY KEY ("symbol","year","season","data_type","subsidiary_company_id")
);
