-- CreateTable
CREATE TABLE "macro_equity_risk_premium" (
    "window_start" TEXT NOT NULL,
    "window_end" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "market_return_geometric" DECIMAL(8,4),
    "market_return_arithmetic" DECIMAL(8,4),
    "avg_risk_free_rate" DECIMAL(8,4),
    "erp_geometric" DECIMAL(8,4),
    "erp_arithmetic" DECIMAL(8,4),
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "macro_equity_risk_premium_pkey" PRIMARY KEY ("window_start","window_end")
);
