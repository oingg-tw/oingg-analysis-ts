-- 補防禦深度（不是修 bug，metric_values 已有的資料完全正確）——「periodType/
-- lookbackRange+samplingInterval/snapshotCadence 這四欄剛好一組是真實值」這條結構不變量，
-- 原本只靠應用層 writeMetricValue() 驗證/推導。這裡加兩層防線：
--   1. coordinate_kind 欄位：顯式記錄「這列屬於哪一組」，不用每個消費端各自推導。
--   2. CHECK 約束：即使有人繞過 writeMetricValue() 直接對這張表 INSERT/UPDATE，DB 也會擋下
--      不一致的列（coordinate_kind 跟四個 basis 欄位對不上）。
--
-- 注意：這條 CHECK 約束不會出現在 schema.prisma（Prisma 7.10.0 的 schema DSL 不支援
-- @@check，npx prisma validate 對它回 P1012 Attribute not known，已實測確認），只存在於
-- migration 歷史——之後如果真的跑 `prisma migrate dev`（非本專案慣用的 migrate deploy
-- 流程），會被當成「schema.prisma 沒宣告的物件」而產生 DROP CONSTRAINT，千萬不要照著跑。

-- ============================================================
-- 加 nullable 欄位
-- ============================================================
ALTER TABLE "metric_values" ADD COLUMN "coordinate_kind" TEXT;

-- ============================================================
-- 依現有四個 basis 欄位回填：哪一欄不是 'N/A' 就屬於哪一組。
-- ============================================================
UPDATE "metric_values"
SET "coordinate_kind" = CASE
  WHEN "period_type" <> 'N/A' THEN 'PERIOD'
  WHEN "lookback_range" <> 'N/A' THEN 'ROLLING_WINDOW'
  WHEN "snapshot_cadence" <> 'N/A' THEN 'SNAPSHOT'
END;

-- ============================================================
-- SET NOT NULL（回填完成後，理論上不會有任何 NULL——如果這裡失敗代表有列三欄都是
-- 'N/A'，是既有資料本身有問題，需要先手動排查，不能盲目套一個 sentinel 蓋過去）。
-- ============================================================
ALTER TABLE "metric_values" ALTER COLUMN "coordinate_kind" SET NOT NULL;

-- ============================================================
-- CHECK 約束：coordinate_kind 跟四個 basis 欄位必須彼此一致。
-- ============================================================
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_coordinate_kind_check" CHECK (
  (
    "coordinate_kind" = 'PERIOD'
    AND "period_type" <> 'N/A'
    AND "lookback_range" = 'N/A'
    AND "sampling_interval" = 'N/A'
    AND "snapshot_cadence" = 'N/A'
  )
  OR (
    "coordinate_kind" = 'ROLLING_WINDOW'
    AND "period_type" = 'N/A'
    AND "lookback_range" <> 'N/A'
    AND "sampling_interval" <> 'N/A'
    AND "snapshot_cadence" = 'N/A'
  )
  OR (
    "coordinate_kind" = 'SNAPSHOT'
    AND "period_type" = 'N/A'
    AND "lookback_range" = 'N/A'
    AND "sampling_interval" = 'N/A'
    AND "snapshot_cadence" <> 'N/A'
  )
);
