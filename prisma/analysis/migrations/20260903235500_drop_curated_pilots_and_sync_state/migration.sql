-- 2026-09-03：使用者決定數據中台的 curated 層現階段太早，連同這 3 個原本就存在的 pilot
-- dataset（mops quarterly_income_statement、gov monthly_gov_bond_yield_10y、
-- gov company_industry_classification）跟 sync_state 一起退場——指標服務已經全部改回直接查
-- 各後台的 export schema，這幾張表沒有任何消費端在讀了。

DROP TABLE IF EXISTS "curated_mops_quarterly_income_statement";
DROP TABLE IF EXISTS "curated_gov_monthly_gov_bond_yield_10y";
DROP TABLE IF EXISTS "curated_gov_company_industry_classification";
DROP TABLE IF EXISTS "sync_state";
