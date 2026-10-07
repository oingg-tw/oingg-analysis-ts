-- 2026-10-08 全市場查詢（排行／名次／分布／data-version）用的索引。原本所有索引都以 symbol 開頭，全市場查詢只能掃整支指標
-- 再排序（排行 0.7～2.2 秒）。欄位順序對齊 screenerQueries.ts buildCte 的
-- WHERE metric_code / period_type / subsidiary_company_id … DISTINCT ON (symbol) ORDER BY symbol, fiscal_year DESC, fiscal_quarter DESC, knowledge_date DESC，
-- 走這支索引就不用 Sort。先建好這支，後面三個檔才拆 latest_lookup，期間不會沒有索引可用。
CREATE INDEX CONCURRENTLY IF NOT EXISTS "metric_values_market_latest" ON "metric_values"("metric_code", "period_type", "subsidiary_company_id", "symbol", "fiscal_year" DESC, "fiscal_quarter" DESC, "knowledge_date" DESC);
