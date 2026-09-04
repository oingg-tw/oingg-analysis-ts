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
// 見 src/domainApi/bvps/service.ts 的 toPerShare——BVPS 曾因為漏了這個換算算出差 1000 倍的錯誤值。
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

export interface CapitalStockChangeSource {
  // 五種結構化的股本變動原因，bigint 序列化成字串——2026-09-04 應 web-nuxt 要求新增，實測過
  // capital_stock_history 沒有庫藏股/可轉債轉換的獨立欄位，這兩種變動反而是寫在 remarks
  // 自由格式文字裡（例如「註銷庫藏股3,249,000股」），不是結構化數字欄位，見 remarks 說明。
  cashIncrease: string | null;
  capitalReserveTransfer: string | null;
  retainedEarningsTransfer: string | null;
  mergerIncrease: string | null;
  capitalReduction: string | null;
  other: string | null; // 自由格式文字，例如「發行限制員工權利新股2,353,000股」，不是這五種結構化原因之一時才會有值
}

export interface CapitalStockHistoryEntry {
  effectiveDate: string; // "YYYY-MM"，這批資料是「異動事件序列」不是固定季度/年度快照，同一年可能 0 筆或多筆
  paidInShares: string; // 實際流通股數（不是千股），bigint 序列化成字串
  paidInCapital: string | null; // 實收資本額（元）
  // 跟「前一次異動」（時間序列上更早的那一筆，不是陣列順序上的前一筆——entries 是新到舊排序）
  // 相比，流通股數變動的百分比，四捨五入到小數 2 位。最早一筆（沒有更早的可以比較）是 null。
  sharesChangePercent: number | null;
  changeSource: CapitalStockChangeSource;
  remarks: string | null; // 自由格式文字，庫藏股註銷/核准日期文字說明等落在這裡，不是結構化欄位
}

interface RawCapitalStockHistoryRow {
  effective_year: number;
  effective_month: number;
  paid_in_shares: bigint | null;
  paid_in_capital: bigint | null;
  source_cash_increase: bigint | null;
  source_capital_reserve_transfer: bigint | null;
  source_retained_earnings_transfer: bigint | null;
  source_merger_increase: bigint | null;
  source_capital_reduction: bigint | null;
  source_other: string | null;
  remarks: string | null;
}

// 給個股頁面「股本變化」卡片用——2026-09-04 應 web-nuxt 要求新增，用途是讓使用者對照流通
// 股數變化跟 EPS 成長，判斷是真成長還是股本膨脹稀釋出來的假象。回傳全部歷史事件，由新到舊
// 排序，查無資料（mops 這批資料目前不是每家公司都有覆蓋）回傳空陣列，不拋錯、不是 404——
// 呼叫端要把「查不到歷史」當成正常情境處理。
export const getCapitalStockHistory = async (symbol: string): Promise<CapitalStockHistoryEntry[]> => {
  const rows = await mopsExportPrisma.$queryRaw<RawCapitalStockHistoryRow[]>`
    SELECT effective_year, effective_month, paid_in_shares, paid_in_capital, source_cash_increase,
      source_capital_reserve_transfer, source_retained_earnings_transfer, source_merger_increase,
      source_capital_reduction, source_other, remarks
    FROM "export"."capital_stock_history"
    WHERE symbol = ${symbol} AND paid_in_shares IS NOT NULL
    ORDER BY effective_year DESC, effective_month DESC
  `;

  // rows 是新到舊排序，index+1 才是時間序列上「更早的前一筆」，用來算變動百分比。
  return rows.map((row, index) => {
    const previous = rows[index + 1];
    const sharesChangePercent =
      previous?.paid_in_shares != null && previous.paid_in_shares !== 0n
        ? Math.round((Number(row.paid_in_shares! - previous.paid_in_shares) / Number(previous.paid_in_shares)) * 100 * 100) / 100
        : null;

    return {
      effectiveDate: `${row.effective_year}-${String(row.effective_month).padStart(2, '0')}`,
      paidInShares: row.paid_in_shares!.toString(),
      paidInCapital: row.paid_in_capital?.toString() ?? null,
      sharesChangePercent,
      changeSource: {
        cashIncrease: row.source_cash_increase?.toString() ?? null,
        capitalReserveTransfer: row.source_capital_reserve_transfer?.toString() ?? null,
        retainedEarningsTransfer: row.source_retained_earnings_transfer?.toString() ?? null,
        mergerIncrease: row.source_merger_increase?.toString() ?? null,
        capitalReduction: row.source_capital_reduction?.toString() ?? null,
        other: row.source_other,
      },
      remarks: row.remarks,
    };
  });
};
