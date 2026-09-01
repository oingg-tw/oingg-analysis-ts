SELECT
  symbol,
  "tradeDate" AS trade_date,
  "peRatio" AS pe_ratio,
  "pbRatio" AS pb_ratio,
  "dividendYield" AS dividend_yield
FROM
  daily_valuation;