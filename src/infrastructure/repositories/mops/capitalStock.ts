import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { isUndefinedTableError } from './prismaErrors';
import { logger } from '@/infrastructure/logger';
import type { CapitalStockHistoryEntry, CapitalStockHistoryPort, PaidInSharesAsOf, PaidInSharesPort } from '@/application/ports/capitalStock';

// PaidInSharesAsOf 型別 2026-09-17 Phase 3 搬到 application/ports/capitalStock.ts；CapitalStockHistoryEntry/
// CapitalStockChangeSource 在 Phase 4 跟進（對外回應的 zod schema 在 http/modules/companies/types.ts），
// 這裡 re-export 給既有 import 路徑。
export type { CapitalStockHistoryEntry, PaidInSharesAsOf };

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
// 2026-09-25 排除「欄位錯位」的列（使用者拍板先擋，mops-ts 重抓修好前的暫時防線）：mops-ts 的 parser 遇到
// 「一列標籤、下一列值」的 MOPS 版面時整體錯位一格，股數拿到資本的值（×10，40 列）或兩欄對調（×100，23 列，
// 例：6546 2025-03 股數 668,484,490／資本 66,848,449）。判準是「股數 ÷（實收資本 ÷ 面額）剛好是 10 的 k 次方、k≠0」
// ——這種比例不可能是真的（特別股、庫藏股造成的是 4157 那種 ×1.028 小差距，不會剛好是 10 倍），所以只擋這一種，
// 其他比例的 55 列不動。**跳過不是修值**：mops-ts 明說不能用 ÷10 或對調修（×10 那種真實股數根本不在這一列），
// 這裡只是不採用壞列、改用生效日更早的最新一筆一致的列。代價：壞列若同時是一次真的增減資，會暫時沿用舊股數。
// 2026-09-25 量到最新一季（115Q2）受影響 6 家：1225、3131、6546、6861、7851、8171。mops-ts 修好（重抓＋修 parser）後，
// 壞列消失，這個條件自然不再命中——不需要回來拿掉，但可以拿掉。見記憶 project_capital_stock_history_coverage_gap。
// 所有讀股數的路徑（每股指標、市值 getMarketCapAsOf、liveMarketCap）都經過這支，擋一次就全部生效。
//
// 注意單位：這裡回傳的 paidInShares 是實際股數（不是千股），但三張季度財報表的金額欄位
// （netIncome、equityValue…）單位是「千元」。算每股數字時分子要先 x1000 換算成元，
// 見 src/api/bff/bvps/service.ts 的 toPerShare——BVPS 曾因為漏了這個換算算出差 1000 倍的錯誤值。
export const getPaidInSharesAsOf = async (symbol: string, asOfDate: Date): Promise<PaidInSharesAsOf | null> => {
  const asOfYear = asOfDate.getUTCFullYear();
  const asOfMonth = asOfDate.getUTCMonth() + 1;

  let rows: RawCapitalStockRow[];
  try {
    rows = await mopsExportPrisma.$queryRaw<RawCapitalStockRow[]>`
      SELECT effective_year, effective_month, paid_in_shares FROM "export"."capital_stock_history"
      WHERE symbol = ${symbol} AND (effective_year < ${asOfYear} OR (effective_year = ${asOfYear} AND effective_month <= ${asOfMonth}))
        AND NOT (
          paid_in_shares > 0 AND paid_in_capital > 0 AND par_value > 0
          AND ROUND(LOG(paid_in_shares::numeric / (paid_in_capital / par_value))) <> 0
          AND ABS(LOG(paid_in_shares::numeric / (paid_in_capital / par_value))
                  - ROUND(LOG(paid_in_shares::numeric / (paid_in_capital / par_value)))) < 0.0005
        )
      ORDER BY effective_year DESC, effective_month DESC LIMIT 1
    `;
  } catch (error) {
    // 2026-09-13：mops-ts 準備移除這張表（查無官方替代），見 prismaErrors.ts 的說明——
    // 表被刪掉後優雅降級成查無資料（null），不是讓依賴這個函式的每股數字（BVPS 等）
    // 跟著噴 500。真正的其他查詢失敗（連線問題等）仍然往上拋，不吞掉。
    if (isUndefinedTableError(error)) {
      logger.warn('[capital-stock]: export.capital_stock_history 表不存在（mops-ts 已移除），優雅降級為查無資料。');
      return null;
    }
    throw error;
  }
  const record = rows[0];
  if (!record || record.paid_in_shares === null) return null;
  return { paidInShares: record.paid_in_shares, effectiveYear: record.effective_year, effectiveMonth: record.effective_month };
};

export const mopsCapitalStockShares: PaidInSharesPort = { getPaidInShares: getPaidInSharesAsOf };

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
  let rows: RawCapitalStockHistoryRow[];
  try {
    rows = await mopsExportPrisma.$queryRaw<RawCapitalStockHistoryRow[]>`
      SELECT effective_year, effective_month, paid_in_shares, paid_in_capital, source_cash_increase,
        source_capital_reserve_transfer, source_retained_earnings_transfer, source_merger_increase,
        source_capital_reduction, source_other, remarks
      FROM "export"."capital_stock_history"
      WHERE symbol = ${symbol} AND paid_in_shares IS NOT NULL
      ORDER BY effective_year DESC, effective_month DESC
    `;
  } catch (error) {
    if (isUndefinedTableError(error)) {
      logger.warn('[capital-stock]: export.capital_stock_history 表不存在（mops-ts 已移除），優雅降級為空陣列。');
      return [];
    }
    throw error;
  }

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

// application/ports/capitalStock.ts 的 CapitalStockHistoryPort 實作——src/bootstrap/deps.ts 綁進 AppDeps。
export const mopsCapitalStockHistory: CapitalStockHistoryPort = { getCapitalStockHistory };
