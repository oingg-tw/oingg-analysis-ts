// mops-ts export schema 底下銀行監理揭露 XBRL 表的即時查詢層——跟 mopsQuarterlyStatements.ts
// 同一種寫法（$queryRawUnsafe，Raw/mapped 兩層 interface），差別是這裡查的是銀行業專屬表
// （`bank_asset_quality_xbrl`/`bank_capital_adequacy_detail_xbrl`），不是三大表，也沒有
// `export.xbrl_three_statements_long` 那套 account_code 對照可用。這兩張表是 2026-09-06
// 盤點技術債時直接查 mops-ts export DB 驗證過的：`bank_asset_quality_xbrl` 覆蓋約 19-20 檔
// 銀行/金控股、每季都有資料；`bank_capital_adequacy_detail_xbrl` 只覆蓋 6-7 檔，且只有
// Q2/Q4 有真實值（監理揭露本來就半年一次，不是資料缺漏）。

import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

export interface BankRegulatoryKey {
  symbol: string;
  year: number;
  quarter: number;
  dataType: string;
  subsidiaryCompanyId: string;
}

// Postgres `numeric` 型別經 $queryRaw 出來型別不穩定（可能是字串也可能是 Prisma Decimal），
// 統一用 Number() 轉成一般數字——跟 mopsQuarterlyStatements.ts 的 toDecimalString 同樣的
// 「numeric 型別不信任」考量，差別是這裡要真正的 number 給 writeMetricValue 用，不是字串。
const toDecimalNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

// ---------------------------------------------------------------------------
// bank_asset_quality_xbrl（逾放比／備抵呆帳覆蓋率）
// ---------------------------------------------------------------------------

export interface BankAssetQualityRow {
  reportDate: Date;
  nonPerformingLoansRatio: number | null;
  coverageRatio: number | null;
}

interface RawBankAssetQualityRow {
  report_date: Date;
  non_performing_loans_ratio: unknown;
  coverage_ratio: unknown;
}

// 只取 category='TotalLoans' 這一列（全行放款加總），不回傳 Secured-CorporateFinance 這類
// 細項類別——這批指標要的是全行逾放比，不是分類明細。
export const getBankAssetQualityTotalLoans = async (key: BankRegulatoryKey): Promise<BankAssetQualityRow | null> => {
  const rows = await mopsExportPrisma.$queryRawUnsafe<RawBankAssetQualityRow[]>(
    `SELECT report_date, non_performing_loans_ratio, coverage_ratio FROM "export"."bank_asset_quality_xbrl"
     WHERE symbol = $1 AND year = $2 AND quarter = $3 AND data_type = $4 AND subsidiary_company_id = $5
       AND category = 'TotalLoans'
     LIMIT 1`,
    key.symbol,
    key.year,
    key.quarter,
    key.dataType,
    key.subsidiaryCompanyId
  );
  const row = rows[0];
  if (!row) return null;
  return {
    reportDate: row.report_date,
    nonPerformingLoansRatio: toDecimalNumber(row.non_performing_loans_ratio),
    coverageRatio: toDecimalNumber(row.coverage_ratio),
  };
};

// 「列存在即算有資料」——這張表對已覆蓋的銀行是每季都有 TotalLoans 真實值，不像
// bank_capital_adequacy_detail_xbrl 那樣每隔一季就整批是 null，見下方那支函式的說明。
export const getLatestQuarterWithBankAssetQuality = async (symbol: string, dataType: string, subsidiaryCompanyId: string): Promise<{ year: number; quarter: number } | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ year: number; quarter: number }[]>`
    SELECT year, quarter FROM "export"."bank_asset_quality_xbrl"
    WHERE symbol = ${symbol} AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId} AND category = 'TotalLoans'
    ORDER BY year DESC, quarter DESC LIMIT 1
  `;
  return rows[0] ?? null;
};

// ---------------------------------------------------------------------------
// bank_capital_adequacy_detail_xbrl（資本適足率／CET1／Tier1）
// ---------------------------------------------------------------------------

export interface BankCapitalAdequacyRow {
  reportDate: Date;
  eligibleCapital: bigint | null;
  riskWeightedAssets: bigint | null;
  ratioOrdinaryShareEquityToRwa: number | null;
  ratioTierICapitalToRwa: number | null;
}

interface RawBankCapitalAdequacyRow {
  report_date: Date;
  eligible_capital: bigint | null;
  risk_weighted_assets: bigint | null;
  ratio_ordinary_share_equity_to_rwa: unknown;
  ratio_tier_i_capital_to_rwa: unknown;
}

export const getBankCapitalAdequacy = async (key: BankRegulatoryKey): Promise<BankCapitalAdequacyRow | null> => {
  const rows = await mopsExportPrisma.$queryRawUnsafe<RawBankCapitalAdequacyRow[]>(
    `SELECT report_date, eligible_capital, risk_weighted_assets, ratio_ordinary_share_equity_to_rwa, ratio_tier_i_capital_to_rwa
     FROM "export"."bank_capital_adequacy_detail_xbrl"
     WHERE symbol = $1 AND year = $2 AND quarter = $3 AND data_type = $4 AND subsidiary_company_id = $5
     LIMIT 1`,
    key.symbol,
    key.year,
    key.quarter,
    key.dataType,
    key.subsidiaryCompanyId
  );
  const row = rows[0];
  if (!row) return null;
  return {
    reportDate: row.report_date,
    eligibleCapital: row.eligible_capital,
    riskWeightedAssets: row.risk_weighted_assets,
    ratioOrdinaryShareEquityToRwa: toDecimalNumber(row.ratio_ordinary_share_equity_to_rwa),
    ratioTierICapitalToRwa: toDecimalNumber(row.ratio_tier_i_capital_to_rwa),
  };
};

// 刻意跟 getLatestQuarterWithBankAssetQuality 不同：這裡要找「eligible_capital IS NOT NULL
// 的最新一季」，不是「列存在的最新一季」——這張表對已覆蓋銀行是每季都有列，但 Q1/Q3 的值
// 全部是 null（監理揭露本來就半年一次），如果比照「列存在即可」的邏輯，自動抓最新一季時
// 一半機率會抓到一個必然是 null 的季度，等於自動解析形同虛設。之後如果要改動這支函式，
// 不要為了跟前者「看起來一致」而拿掉這個 IS NOT NULL 條件。
export const getLatestQuarterWithBankCapitalAdequacy = async (
  symbol: string,
  dataType: string,
  subsidiaryCompanyId: string
): Promise<{ year: number; quarter: number } | null> => {
  const rows = await mopsExportPrisma.$queryRaw<{ year: number; quarter: number }[]>`
    SELECT year, quarter FROM "export"."bank_capital_adequacy_detail_xbrl"
    WHERE symbol = ${symbol} AND data_type = ${dataType} AND subsidiary_company_id = ${subsidiaryCompanyId} AND eligible_capital IS NOT NULL
    ORDER BY year DESC, quarter DESC LIMIT 1
  `;
  return rows[0] ?? null;
};
