SELECT
  symbol,
  "tradeDate" AS trade_date,
  OPEN,
  high,
  low,
  close,
  volume,
  turnover,
  transaction,
  "monthlyAvg" AS monthly_avg
FROM
  daily_price;