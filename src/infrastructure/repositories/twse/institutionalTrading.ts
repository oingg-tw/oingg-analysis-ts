import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import type { ForeignNetBuyWindow } from '@/application/ports/marketData';

// 2026-10-07 twse-ts export.institutional_trading（T86 三大法人買賣超日報，逐檔逐日，股數）。2026-09-01 才開始收、沒有歷史回填；
// 只有上市公司（櫃買中心版本 tpex-ts 評估可做但還沒排上線日，上線後再加查 tpex 並回填）。
// 窗口用「表裡全市場的交易日」而不是「這檔有列的日子」：某天這檔沒有法人交易就沒有列，用這檔自己的列數算 20 天會跨到更早。
// ponytail: 交易日清單每檔都重查一次（DISTINCT trade_date），全市場一輪約 1,000 次；慢了再改成呼叫端先查一次傳進來。
export const getForeignNetBuyWindow = async (symbol: string, asOf: Date, days: number): Promise<ForeignNetBuyWindow> => {
  const dates = await twseExportPrisma.$queryRaw<{ trade_date: Date }[]>`
    SELECT DISTINCT trade_date FROM "export"."institutional_trading"
    WHERE trade_date <= ${asOf} ORDER BY trade_date DESC LIMIT ${days}
  `;
  const tradeDates = dates.map((d) => d.trade_date).reverse();
  if (tradeDates.length === 0) return { tradeDates, rows: [] };
  const rows = await twseExportPrisma.$queryRaw<{ trade_date: Date; net: bigint }[]>`
    SELECT trade_date, COALESCE(foreign_net_buy, 0) + COALESCE(foreign_dealer_net_buy, 0) AS net
    FROM "export"."institutional_trading"
    WHERE symbol = ${symbol} AND trade_date >= ${tradeDates[0]} AND trade_date <= ${asOf}
    ORDER BY trade_date ASC
  `;
  return { tradeDates, rows: rows.map((r) => ({ tradeDate: r.trade_date, netBuyShares: BigInt(r.net) })) };
};
