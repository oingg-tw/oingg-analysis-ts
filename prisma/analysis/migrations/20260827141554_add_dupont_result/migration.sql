-- CreateTable
CREATE TABLE "profitability_dupont" (
    "symbol" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "data_type" TEXT NOT NULL,
    "subsidiary_company_id" TEXT NOT NULL DEFAULT '',
    "report_date" DATE,
    "net_profit_margin_quarterly" DECIMAL(10,2),
    "net_profit_margin_ttm" DECIMAL(10,2),
    "asset_turnover_quarterly" DECIMAL(14,4),
    "asset_turnover_ttm" DECIMAL(14,4),
    "equity_multiplier" DECIMAL(14,4),
    "decomposed_roe_quarterly_pct" DECIMAL(10,2),
    "decomposed_roe_ttm_pct" DECIMAL(10,2),
    "actual_roe_quarterly_pct" DECIMAL(10,2),
    "actual_roe_ttm_pct" DECIMAL(10,2),
    "total_assets_value" BIGINT,
    "equity_field_used" TEXT,
    "equity_value" BIGINT,
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profitability_dupont_pkey" PRIMARY KEY ("symbol","year","season","data_type","subsidiary_company_id")
);
