// 資產負債表依賴指標的查詢層——2026-09-11 舊三大表（quarterly_balance_sheet，
// mopsQuarterlyStatements.ts）已退役，改為單純查 XBRL 寬表（export.quarterly_balance_sheet_xbrl），
// 不再有 fallback 分支。退役理由：開發階段接受資料缺口（3,477 組舊表獨有、XBRL 目前
// 沒有的 (symbol, year, quarter) 組合直接查無資料），換取不用維護兩個資料源 coalesce
// 邏輯的簡單度。已通知 mops-ts。
// 2026-09-07 用 2330/2317/1301/2412/2887/1101/1312/1522/2002 115Q1/115Q2 逐欄位交叉驗證過
// 16 個欄位跟舊表完全一致：
// - accountsPayable 只對應 trade_payables_to_trade_suppliers，不含 trade_payables_to_related_parties。
// - bondsPayable 只對應 noncurrent_portion_of_bonds_issued，不含流動部分
//   （current_bonds_issued_and_portion），用 2317/1301/2412 三家流動部分非 null 的案例驗證過。
// - preferredStockCapital 對應 preference_share，用 1101/1312/1522/2002 四家驗證過。
// - accountsReceivable 對應 accounts_receivable_net，儘管欄位名稱有 net 字尾，驗證案例完全一致。
//
// 31 支既有 computeXxxPit.ts 只透過 getBalanceSheetXbrlFirst(key) 存取以下 16 個欄位 +
// reportDate（capitalStock 完全沒有任何檔案存取，這裡不處理——流通股數需求走獨立的
// @/models/mops/capitalStock.ts）。

import type { QuarterlyKey } from '../../../domain/financials/quarterlyKey';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import type { BalanceSheetFields } from '@/application/ports/financialStatements';

// BalanceSheetFields 2026-09-17 Phase 3 搬到 application/ports/financialStatements.ts（port 的 DTO），這裡 re-export 給既有 import 路徑。
export type { BalanceSheetFields };

interface RawBalanceSheetXbrlRow {
  report_date: Date;
  assets: bigint | null;
  liabilities: bigint | null;
  current_assets: bigint | null;
  current_liabilities: bigint | null;
  noncurrent_liabilities: bigint | null;
  inventories: bigint | null;
  longterm_borrowings: bigint | null;
  property_plant_and_equipment: bigint | null;
  retained_earnings: bigint | null;
  cash_and_cash_equivalents: bigint | null;
  equity_attributable_to_owners_of_parent: bigint | null;
  equity: bigint | null;
  trade_payables_to_trade_suppliers: bigint | null;
  trade_payables_to_related_parties: bigint | null;
  notes_payable: bigint | null;
  current_contract_liabilities: bigint | null;
  accounts_receivable_net: bigint | null;
  noncurrent_portion_of_bonds_issued: bigint | null;
  shortterm_borrowings: bigint | null;
  preference_share: bigint | null;
  current_cp_issued_and_portion: bigint | null;
  longterm_liabilities_current_portion: bigint | null;
  current_bonds_issued_and_portion: bigint | null;
  current_portion_of_longterm_borrowings: bigint | null;
  current_lease_liabilities: bigint | null;
  noncurrent_lease_liabilities: bigint | null;
  noncurrent_finance_lease_liabilities: bigint | null;
  noncurrent_liabilities_defined_benefit: bigint | null;
}

const mapXbrlRow = (row: RawBalanceSheetXbrlRow): BalanceSheetFields => ({
  reportDate: row.report_date,
  totalAssets: row.assets,
  totalLiabilities: row.liabilities,
  currentAssets: row.current_assets,
  currentLiabilities: row.current_liabilities,
  noncurrentLiabilities: row.noncurrent_liabilities,
  inventory: row.inventories,
  longTermBorrowings: row.longterm_borrowings,
  propertyPlantEquipment: row.property_plant_and_equipment,
  retainedEarnings: row.retained_earnings,
  cashAndEquivalents: row.cash_and_cash_equivalents,
  equityAttributableToParent: row.equity_attributable_to_owners_of_parent,
  totalEquity: row.equity,
  accountsPayable: row.trade_payables_to_trade_suppliers,
  tradePayablesToRelatedParties: row.trade_payables_to_related_parties,
  notesPayable: row.notes_payable,
  currentContractLiabilities: row.current_contract_liabilities,
  accountsReceivable: row.accounts_receivable_net,
  bondsPayable: row.noncurrent_portion_of_bonds_issued,
  shortTermBorrowings: row.shortterm_borrowings,
  preferredStockCapital: row.preference_share,
  shortTermNotesAndBillsPayable: row.current_cp_issued_and_portion,
  // 2026-09-28 一年內到期長期負債優先取母科目（1301 115Q2：12,871,487 = 一年內到期公司債 8,474,161 + 一年內到期長期借款 4,397,326，
  // 上下層加總一致）；母科目缺才用兩個子科目相加（1,439 家有母科目、子科目各只有 150／522 家）。
  currentPortionOfLongTermLiabilities:
    row.longterm_liabilities_current_portion ??
    (row.current_bonds_issued_and_portion === null && row.current_portion_of_longterm_borrowings === null
      ? null
      : (row.current_bonds_issued_and_portion ?? 0n) + (row.current_portion_of_longterm_borrowings ?? 0n)),
  currentLeaseLiabilities: row.current_lease_liabilities,
  // 2026-10-09 mops-ts 查證：115 年以前 XBRL 元素是 ifrs-full:NoncurrentFinanceLeaseLiabilities（存在 noncurrent_finance_lease_liabilities），
  // 115 年起改 NoncurrentLeaseLiabilities；報表上同一行（科目 2580），兩欄互補不重疊，同一時點 1,594 家有 1,593 家數字相同。
  // 只讀新欄位時 109～113 年非流動租賃全空，淨負債／EBITDA 的 S&P 調整後負債一直少算。mops 之後會把舊值也填進新欄位，屆時兩者相同。
  noncurrentLeaseLiabilities: row.noncurrent_lease_liabilities ?? row.noncurrent_finance_lease_liabilities,
  netDefinedBenefitLiability: row.noncurrent_liabilities_defined_benefit,
});

export const getLatestQuarterWithBalanceSheetXbrl = async (symbol: string, dataType: string, subsidiaryCompanyId: string): Promise<{ year: number; quarter: number } | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ year: number; quarter: number }[]>`
    SELECT year, quarter FROM "export"."quarterly_balance_sheet_xbrl"
    WHERE symbol = ${symbol} AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId}
    ORDER BY year DESC, quarter DESC LIMIT 1
  `;
  return rows[0] ?? null;
};

export const getBalanceSheetXbrlFirst = async (key: QuarterlyKey): Promise<BalanceSheetFields | null> => {
  const rows = await mopsExportPrisma.$queryRaw<RawBalanceSheetXbrlRow[]>`
    SELECT report_date, assets, liabilities, current_assets, current_liabilities, noncurrent_liabilities, inventories,
      longterm_borrowings, property_plant_and_equipment, retained_earnings, cash_and_cash_equivalents,
      equity_attributable_to_owners_of_parent, equity, trade_payables_to_trade_suppliers, trade_payables_to_related_parties, notes_payable, current_contract_liabilities,
      accounts_receivable_net, noncurrent_portion_of_bonds_issued, shortterm_borrowings, preference_share,
      current_cp_issued_and_portion, longterm_liabilities_current_portion, current_bonds_issued_and_portion,
      current_portion_of_longterm_borrowings, current_lease_liabilities, noncurrent_lease_liabilities, noncurrent_finance_lease_liabilities, noncurrent_liabilities_defined_benefit
    FROM "export"."quarterly_balance_sheet_xbrl"
    WHERE symbol = ${key.symbol} AND year = ${key.year} AND quarter = ${key.quarter}
      AND data_type = ${key.dataType} AND subsidiary_company_id = ${key.subsidiaryCompanyId}
    LIMIT 1
  `;

  return rows[0] ? mapXbrlRow(rows[0]) : null;
};
