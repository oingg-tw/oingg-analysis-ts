import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

// XBRL 損益表寬表（export.quarterly_income_statement_xbrl）裡「不在 incomeStatementXbrlFirst.ts
// 那 11 個跟舊表相容欄位」之內的零星欄位。2026-09-17 重構 Phase 2 合併三份一模一樣的 raw SQL
// （computeRdIntensityPit / getRdIntensityProvenance / computePriceToResearchRatioPit 各自抄一份）。
export interface XbrlQuarterKey {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
}

// 研發費用只存在 XBRL 寬表，舊表沒有對應欄位、沒有 fallback。查無整列 XBRL 資料（該季完全沒有
// XBRL 申報）時回 null，呼叫端視為缺漏（missing_input），不猜測是「真的沒有研發費用」還是「還沒回填」。
export const getResearchAndDevelopmentExpense = async (key: XbrlQuarterKey): Promise<bigint | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ research_and_development_expense: bigint | null }[]>`
    SELECT research_and_development_expense FROM "export"."quarterly_income_statement_xbrl"
    WHERE symbol = ${key.symbol} AND year = ${key.year} AND quarter = ${key.quarter}
      AND data_type = ${key.dataType} AND subsidiary_company_id = ${key.subsidiaryCompanyId}
    LIMIT 1
  `;
  return rows[0]?.research_and_development_expense ?? null;
};
