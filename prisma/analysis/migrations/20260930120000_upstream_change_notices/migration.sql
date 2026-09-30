-- 2026-09-30 上游變動通知的待辦表與處理權租約（使用者拍板：mops／tpex／twse 寫完資料後 POST「處理到 export.row_changes
-- 的第幾筆」到 /upstream/changes，我們存成待辦，處理程式依序處理）。見 src/infrastructure/repositories/analysis/upstreamChangeQueue.ts、
-- scripts/processUpstreamChangesPit.ts。
--
-- 手寫（`prisma migrate dev` 一律不跑，流程見 schema.prisma 的 MetricDailyCadenceValue 檔頭）。只有 CREATE，對既有資料零影響。

-- 一筆通知一列。(source, up_to_id) 唯一：同一個來源同一個 upToId 重送不會重複入列；入列語句另外擋掉「比已收過的小」。
-- status：pending → done（summary 記處理結果，含認不得的表與失敗清單，給人看）／failed（error 記原因，下次從上次 done 處重做）。
CREATE TABLE "upstream_change_notices" (
    "id" BIGSERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "up_to_id" BIGINT NOT NULL,
    "tables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "processed_at" TIMESTAMPTZ(3),
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "upstream_change_notices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "upstream_change_notices_source_check" CHECK ("source" IN ('mops', 'tpex', 'twse')),
    CONSTRAINT "upstream_change_notices_status_check" CHECK ("status" IN ('pending', 'done', 'failed'))
);

CREATE UNIQUE INDEX "upstream_change_notices_source_up_to_id_key" ON "upstream_change_notices"("source", "up_to_id");
CREATE INDEX "upstream_change_notices_status_source_idx" ON "upstream_change_notices"("status", "source");

-- 處理權租約：只有一列（id=1）。同一時間只讓一個處理程式跑（守 DB 併發 ≤ 8）；expires_at 過了（處理程式死掉）別人就能接手。
CREATE TABLE "upstream_processor_lease" (
    "id" SMALLINT NOT NULL,
    "holder" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT '1970-01-01T00:00:00Z',

    CONSTRAINT "upstream_processor_lease_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "upstream_processor_lease_single_row" CHECK ("id" = 1)
);

INSERT INTO "upstream_processor_lease" ("id") VALUES (1);
