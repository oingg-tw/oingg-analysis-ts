-- CreateTable
CREATE TABLE "reference_industry_code" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_industry_code_pkey" PRIMARY KEY ("code")
);
