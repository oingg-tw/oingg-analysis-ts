import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

export interface PaidInSharesAsOf {
  paidInShares: bigint;
  effectiveYear: number; // 西元年，對應 capital_stock_history.effectiveYear
  effectiveMonth: number;
}

interface RawCapitalStockRow {
  effective_year: number;
  effective_month: number;
  paid_in_shares: bigint | null;
}

// 股本是歷史異動紀錄（現金增資、盈餘轉增資、減資…生效當月各一筆），不能直接抓整張表最新一筆。
// 查某個時間點（例如某季資產負債表的報告日）對應的流通股數，要找生效日 <= asOfDate 的最新一筆。
// 2026-09-03 使用者決定 curated 中台層現階段太早，改回直接查 mopsExportPrisma（etl_reader，
// export.capital_stock_history 這張 view 沒有唯一識別欄位，走 $queryRaw）。
//
// 注意單位：這裡回傳的 paidInShares 是實際股數（不是千股），但三張季度財報表的金額欄位
// （netIncome、equityValue…）單位是「千元」。算每股數字時分子要先 x1000 換算成元，
// 見 src/domains/bvps/service.ts 的 toPerShare——BVPS 曾因為漏了這個換算算出差 1000 倍的錯誤值。
export const getPaidInSharesAsOf = async (symbol: string, asOfDate: Date): Promise<PaidInSharesAsOf | null> => {
  const asOfYear = asOfDate.getUTCFullYear();
  const asOfMonth = asOfDate.getUTCMonth() + 1;

  const rows = await mopsExportPrisma.$queryRaw<RawCapitalStockRow[]>`
    SELECT effective_year, effective_month, paid_in_shares FROM "export"."capital_stock_history"
    WHERE symbol = ${symbol} AND (effective_year < ${asOfYear} OR (effective_year = ${asOfYear} AND effective_month <= ${asOfMonth}))
    ORDER BY effective_year DESC, effective_month DESC LIMIT 1
  `;
  const record = rows[0];
  if (!record || record.paid_in_shares === null) return null;
  return { paidInShares: record.paid_in_shares, effectiveYear: record.effective_year, effectiveMonth: record.effective_month };
};
