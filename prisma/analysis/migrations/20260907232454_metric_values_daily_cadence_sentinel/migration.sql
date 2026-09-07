-- AlterTable
ALTER TABLE "metric_values" ADD COLUMN     "trade_date" DATE,
ALTER COLUMN "fiscal_quarter" SET NOT NULL;

