-- 手動撰寫，不是 `prisma migrate dev` 自動產生的——這個環境是非互動式 shell，
-- `prisma migrate dev` 在偵測到欄位改名時只會提供「drop + add」這種會清空既有 1439 筆
-- 資料的破壞性方案，且非互動模式下直接拒絕執行。改用單純的 RENAME COLUMN，PostgreSQL
-- 會自動沿用既有的複合主鍵約束（PK 是靠內部 attnum 追蹤，不是靠欄位名稱），不需要另外
-- 重建 constraint，資料完全保留。
ALTER TABLE "portfolio_beta" RENAME COLUMN "as_of_date" TO "trade_date";
