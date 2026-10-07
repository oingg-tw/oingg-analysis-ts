-- 2026-10-08 照 PostgreSQL 指南調整（這一批 8 個 migration 依序套用）。
-- CONCURRENTLY 不能在交易裡跑，所以這類檔案一個檔只放一條語句，也就不能在同一個檔裡 SET lock_timeout；
-- CONCURRENTLY 只拿 SHARE UPDATE EXCLUSIVE，不擋讀寫。
--
-- 稽核表 (model_name, captured_at) 索引：唯一的讀取（countShadowRowsSince）跟新的 90 天保留刪除都只看 captured_at，
-- 換成單欄索引。先拆舊的，下一個檔改 captured_at 型別時才不用重建它（timestamp → timestamptz 的 opclass 不同）。
DROP INDEX CONCURRENTLY IF EXISTS "metric_upsert_shadow_model_name_captured_at_idx";
