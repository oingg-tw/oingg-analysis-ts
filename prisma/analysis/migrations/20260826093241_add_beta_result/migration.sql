-- CreateTable
CREATE TABLE "portfolio_beta" (
    "symbol" TEXT NOT NULL,
    "as_of_date" DATE NOT NULL,
    "beta_1y" DECIMAL(10,4),
    "beta_2y" DECIMAL(10,4),
    "beta_5y" DECIMAL(10,4),
    "observations_1y" INTEGER,
    "observations_2y" INTEGER,
    "observations_5y" INTEGER,
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_beta_pkey" PRIMARY KEY ("symbol","as_of_date")
);
