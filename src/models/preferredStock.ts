// 特別股（preferred_stock）的即時查詢層——比照 mopsQuarterlyStatements.ts/bankRegulatoryXbrl.ts
// 的 $queryRawUnsafe 寫法。兩張表分屬不同資料庫：twse-ts 的 isin_securities（目前上市中的
// 證券登記清單，用來篩出哪些 symbol 是特別股）跟 mops-ts 的 preferred_stock_right（發行條款，
// 20+ 欄位）。join key 是 isin_securities.symbol = preferred_stock_right.preferred_stock_code
// （已用 2026-09-06 實測資料驗證過：目前 28 檔上市中的特別股全部對得上）。TPEx（上櫃）目前
// 沒有 isin_securities 這張表，這批只能涵蓋上市（TWSE）。

import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';
import { isUndefinedTableError } from './prismaErrors';
import { logger } from '@/shared/logger';

export interface PreferredStockSecurity {
  symbol: string;
  name: string;
  isinCode: string;
  listedDate: Date;
  marketType: string;
}

interface RawIsinSecuritiesRow {
  symbol: string;
  name: string;
  isin_code: string;
  listed_date: Date;
  market_type: string;
}

// 只回傳目前上市中的特別股（isin_securities 是「目前有效登記」清單，不是歷史檔案）——
// 2026-09-06 實測 security_type='特別股' 共 28 檔。
export const getPreferredStockSecurities = async (): Promise<PreferredStockSecurity[]> => {
  const rows = await twseExportPrisma.$queryRaw<RawIsinSecuritiesRow[]>`
    SELECT symbol, name, isin_code, listed_date, market_type FROM "export"."isin_securities"
    WHERE security_type = '特別股'
    ORDER BY symbol
  `;
  return rows.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    isinCode: row.isin_code,
    listedDate: row.listed_date,
    marketType: row.market_type,
  }));
};

export interface PreferredStockRight {
  issueDate: Date;
  issuePrice: number | null;
  dividendRate: number | null; // 每股固定配息金額（新台幣元），不是百分比——2026-09-06 逐檔實測驗證過，欄位名稱容易誤會
  cumulativeDividend: boolean;
  participatingExcessDividend: boolean;
  liquidationPreference: boolean;
  votingRights: boolean;
  convertible: boolean;
  conversionStartDate: Date | null;
  redeemable: boolean;
  redemptionDate: Date | null;
  redemptionConditions: string | null;
  // 2026-09-08 mops-ts 新增：這檔是否在人工驗證覆寫表裡有記錄，跟 redemptionDate 是否為
  // null 是兩件事——1312A/2002A 這種「已查證章程、確認有收回權但條款本身沒有固定收回日」
  // 跟「自動化資料，沒有人查證過」原本混在一起分不清，這個欄位解決這個問題。null 代表
  // mops-ts 這批資料還沒有這個欄位或查無記錄，前端不應該當成「已查證為 false」。
  redemptionVerified: boolean | null;
}

interface RawPreferredStockRightRow {
  issue_date: Date;
  issue_price: unknown;
  dividend_rate: unknown;
  cumulative_dividend: boolean;
  participating_excess_dividend: boolean;
  liquidation_preference: boolean;
  voting_rights: boolean;
  convertible: boolean;
  conversion_start_date: Date | null;
  redeemable: boolean;
  redemption_date: Date | null;
  redemption_conditions: string | null;
  redemption_verified: boolean | null;
}

const toDecimalNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

// 同一個 preferred_stock_code 會有多列（series_no 遞增）代表配息條件歷次修訂（例如發行後
// 幾年重新訂價），取最新一次修訂的條款——不能假設一個 code 只有一列。
export const getLatestPreferredStockRight = async (preferredStockCode: string): Promise<PreferredStockRight | null> => {
  let rows: RawPreferredStockRightRow[];
  try {
    rows = await mopsExportPrisma.$queryRaw<RawPreferredStockRightRow[]>`
      SELECT issue_date, issue_price, dividend_rate, cumulative_dividend, participating_excess_dividend,
        liquidation_preference, voting_rights, convertible, conversion_start_date, redeemable,
        redemption_date, redemption_conditions, redemption_verified
      FROM "export"."preferred_stock_right"
      WHERE preferred_stock_code = ${preferredStockCode}
      ORDER BY series_no DESC LIMIT 1
    `;
  } catch (error) {
    // 2026-09-13：mops-ts 準備移除這張表（查無官方替代），見 prismaErrors.ts 的說明——
    // 表被刪掉後優雅降級成查無發行條款（null），不是讓特別股端點跟著噴 500。
    if (isUndefinedTableError(error)) {
      logger.warn('[preferred-stock]: export.preferred_stock_right 表不存在（mops-ts 已移除），優雅降級為查無資料。');
      return null;
    }
    throw error;
  }
  const row = rows[0];
  if (!row) return null;
  return {
    issueDate: row.issue_date,
    issuePrice: toDecimalNumber(row.issue_price),
    dividendRate: toDecimalNumber(row.dividend_rate),
    cumulativeDividend: row.cumulative_dividend,
    participatingExcessDividend: row.participating_excess_dividend,
    liquidationPreference: row.liquidation_preference,
    votingRights: row.voting_rights,
    convertible: row.convertible,
    conversionStartDate: row.conversion_start_date,
    redeemable: row.redeemable,
    redemptionDate: row.redemption_date,
    redemptionConditions: row.redemption_conditions,
    redemptionVerified: row.redemption_verified,
  };
};
