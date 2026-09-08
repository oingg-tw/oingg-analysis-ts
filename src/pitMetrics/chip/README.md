# chip（籌碼）

因子分類骨架，2026-09-08 建立。指標分類進行中，逐支由使用者指定歸類，見對話紀錄。

籌碼面指標（例如外資持股比例、融資融券、三大法人買賣超）目前大多還在 `src/api/bff/market/`
底下以獨立排行/查詢端點的形式存在（`foreignShareholding.ts`、`marginShortRatioRanking/`、
`foreignHoldingRanking/`——後者已於 2026-09-08 隨 twse-ts 退役 `export.foreign_holding`
一併移除），還沒有走 pitMetrics 的 `metric_values`/`knowledgeDate`/`basis` 架構。這個資料夾
是預留給之後真的要把籌碼面數字遷入 point-in-time 架構時使用，目前是空的。
