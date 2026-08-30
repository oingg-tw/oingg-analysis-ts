-- CreateTable
CREATE TABLE "technicals_ma" (
    "symbol" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "ma_5d" DECIMAL(10,2),
    "ma_10d" DECIMAL(10,2),
    "ma_20d" DECIMAL(10,2),
    "ma_60d" DECIMAL(10,2),
    "ma_120d" DECIMAL(10,2),
    "ma_200d" DECIMAL(10,2),
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technicals_ma_pkey" PRIMARY KEY ("symbol","trade_date")
);

-- CreateTable
CREATE TABLE "technicals_rsi" (
    "symbol" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "rsi_6d" DECIMAL(6,2),
    "rsi_14d" DECIMAL(6,2),
    "rsi_24d" DECIMAL(6,2),
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technicals_rsi_pkey" PRIMARY KEY ("symbol","trade_date")
);

-- CreateTable
CREATE TABLE "technicals_kd" (
    "symbol" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "k_9d" DECIMAL(6,2),
    "d_9d" DECIMAL(6,2),
    "k_14d" DECIMAL(6,2),
    "d_14d" DECIMAL(6,2),
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technicals_kd_pkey" PRIMARY KEY ("symbol","trade_date")
);

-- CreateTable
CREATE TABLE "technicals_bollinger_bands" (
    "symbol" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "middle" DECIMAL(10,2),
    "upper" DECIMAL(10,2),
    "lower" DECIMAL(10,2),
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technicals_bollinger_bands_pkey" PRIMARY KEY ("symbol","trade_date")
);

-- CreateTable
CREATE TABLE "technicals_atr" (
    "symbol" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "atr_14d" DECIMAL(10,2),
    "atr_20d" DECIMAL(10,2),
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technicals_atr_pkey" PRIMARY KEY ("symbol","trade_date")
);

-- CreateTable
CREATE TABLE "technicals_bias" (
    "symbol" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "bias_5d" DECIMAL(10,2),
    "bias_20d" DECIMAL(10,2),
    "bias_60d" DECIMAL(10,2),
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technicals_bias_pkey" PRIMARY KEY ("symbol","trade_date")
);

-- CreateTable
CREATE TABLE "technicals_macd" (
    "symbol" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "dif" DECIMAL(10,4),
    "dem" DECIMAL(10,4),
    "osc" DECIMAL(10,4),
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technicals_macd_pkey" PRIMARY KEY ("symbol","trade_date")
);

-- CreateTable
CREATE TABLE "technicals_obv" (
    "symbol" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "obv" BIGINT,
    "warnings" TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technicals_obv_pkey" PRIMARY KEY ("symbol","trade_date")
);

