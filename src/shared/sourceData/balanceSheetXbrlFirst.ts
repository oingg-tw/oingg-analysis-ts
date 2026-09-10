// 資產負債表依賴指標的 drop-in 替換查詢層——XBRL 寬表（export.quarterly_balance_sheet_xbrl）
// 優先，查無資料才退回既有的 quarterly_balance_sheet（mopsQuarterlyStatements.ts）。
// 2026-09-07 用 2330/2317/1301/2412/2887/1101/1312/1522/2002 115Q1/115Q2 逐欄位交叉驗證過
// 16 個欄位跟舊表完全一致：
// - accountsPayable 只對應 trade_payables_to_trade_suppliers，不含 trade_payables_to_related_parties。
// - bondsPayable 只對應 noncurrent_portion_of_bonds_issued，不含流動部分
//   （current_bonds_issued_and_portion），用 2317/1301/2412 三家流動部分非 null 的案例驗證過。
// - preferredStockCapital 對應 preference_share，用 1101/1312/1522/2002 四家驗證過。
// - accountsReceivable 對應 accounts_receivable_net，儘管欄位名稱有 net 字尾，驗證案例完全一致。
//
// 31 支既有 computeXxxPit.ts 只透過 getQuarterlyBalanceSheet(key) 存取以下 16 個欄位 +
// reportDate（capitalStock 完全沒有任何檔案存取，這裡不處理——流通股數需求走獨立的
// @/shared/sourceData/capitalStock.ts），這裡維持完全相同的函式簽章，呼叫端只需要換
// import，公式/null_reason 判斷邏輯完全不用改。

import type { QuarterlyKey } from './mopsQuarterlyStatements';
import { getQuarterlyBalanceSheet } from './mopsQuarterlyStatements';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

export interface BalanceSheetFields {
  reportDate: Date;
  // 2026-09-10 新增：理由同 incomeStatementXbrlFirst.ts 的 source 欄位說明。
  source: 'xbrl' | 'legacy';
  totalAssets: bigint | null;
  totalLiabilities: bigint | null;
  currentAssets: bigint | null;
  currentLiabilities: bigint | null;
  inventory: bigint | null;
  longTermBorrowings: bigint | null;
  propertyPlantEquipment: bigint | null;
  retainedEarnings: bigint | null;
  cashAndEquivalents: bigint | null;
  equityAttributableToParent: bigint | null;
  totalEquity: bigint | null;
  accountsPayable: bigint | null;
  accountsReceivable: bigint | null;
  bondsPayable: bigint | null;
  shortTermBorrowings: bigint | null;
  preferredStockCapital: bigint | null;
}

interface RawBalanceSheetXbrlRow {
  report_date: Date;
  assets: bigint | null;
  liabilities: bigint | null;
  current_assets: bigint | null;
  current_liabilities: bigint | null;
  inventories: bigint | null;
  longterm_borrowings: bigint | null;
  property_plant_and_equipment: bigint | null;
  retained_earnings: bigint | null;
  cash_and_cash_equivalents: bigint | null;
  equity_attributable_to_owners_of_parent: bigint | null;
  equity: bigint | null;
  trade_payables_to_trade_suppliers: bigint | null;
  accounts_receivable_net: bigint | null;
  noncurrent_portion_of_bonds_issued: bigint | null;
  shortterm_borrowings: bigint | null;
  preference_share: bigint | null;
}

const mapXbrlRow = (row: RawBalanceSheetXbrlRow): BalanceSheetFields => ({
  reportDate: row.report_date,
  source: 'xbrl',
  totalAssets: row.assets,
  totalLiabilities: row.liabilities,
  currentAssets: row.current_assets,
  currentLiabilities: row.current_liabilities,
  inventory: row.inventories,
  longTermBorrowings: row.longterm_borrowings,
  propertyPlantEquipment: row.property_plant_and_equipment,
  retainedEarnings: row.retained_earnings,
  cashAndEquivalents: row.cash_and_cash_equivalents,
  equityAttributableToParent: row.equity_attributable_to_owners_of_parent,
  totalEquity: row.equity,
  accountsPayable: row.trade_payables_to_trade_suppliers,
  accountsReceivable: row.accounts_receivable_net,
  bondsPayable: row.noncurrent_portion_of_bonds_issued,
  shortTermBorrowings: row.shortterm_borrowings,
  preferredStockCapital: row.preference_share,
});

// 2026-09-10 新增：給 latestQuarter.ts 用——「列存在即算有資料」，不檢查個別欄位是否為
// null（跟 xbrlCashFlowQuarterly.ts 的 getLatestQuarterWithXbrlCashFlowQuarterly 同一種
// 判斷）。單獨查這張表最新一季，不含舊表 fallback——latestQuarter.ts 自己會把這個結果
// 跟舊表的最新一季取較新的那個，不要在這裡預先決定。
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
    SELECT report_date, assets, liabilities, current_assets, current_liabilities, inventories,
      longterm_borrowings, property_plant_and_equipment, retained_earnings, cash_and_cash_equivalents,
      equity_attributable_to_owners_of_parent, equity, trade_payables_to_trade_suppliers,
      accounts_receivable_net, noncurrent_portion_of_bonds_issued, shortterm_borrowings, preference_share
    FROM "export"."quarterly_balance_sheet_xbrl"
    WHERE symbol = ${key.symbol} AND year = ${key.year} AND quarter = ${key.quarter}
      AND data_type = ${key.dataType} AND subsidiary_company_id = ${key.subsidiaryCompanyId}
    LIMIT 1
  `;

  if (rows[0]) return mapXbrlRow(rows[0]);

  // 完全查無 XBRL 列——整批 fallback 既有三大表，不逐欄位混用兩個資料源。
  const legacy = await getQuarterlyBalanceSheet(key);
  if (!legacy) return null;
  return {
    reportDate: legacy.reportDate,
    source: 'legacy',
    totalAssets: legacy.totalAssets,
    totalLiabilities: legacy.totalLiabilities,
    currentAssets: legacy.currentAssets,
    currentLiabilities: legacy.currentLiabilities,
    inventory: legacy.inventory,
    longTermBorrowings: legacy.longTermBorrowings,
    propertyPlantEquipment: legacy.propertyPlantEquipment,
    retainedEarnings: legacy.retainedEarnings,
    cashAndEquivalents: legacy.cashAndEquivalents,
    equityAttributableToParent: legacy.equityAttributableToParent,
    totalEquity: legacy.totalEquity,
    accountsPayable: legacy.accountsPayable,
    accountsReceivable: legacy.accountsReceivable,
    bondsPayable: legacy.bondsPayable,
    shortTermBorrowings: legacy.shortTermBorrowings,
    preferredStockCapital: legacy.preferredStockCapital,
  };
};
