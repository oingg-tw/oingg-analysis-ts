SELECT
  symbol,
  "tradeDate" AS trade_date,
  "peRatio" AS pe_ratio,
  "pbRatio" AS pb_ratio,
  "dividendYield" AS dividend_yield,
  updated_at
FROM
  daily_valuation;