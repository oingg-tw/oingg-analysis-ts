SELECT
  symbol,
  "tradeDate" AS trade_date,
  OPEN,
  high,
  low,
  close,
  volume,
  turnover,
  transaction
FROM
  daily_price;