// 特別股（preferred_stock）的即時查詢層——比照 mopsQuarterlyStatements.ts/bankRegulatoryXbrl.ts
// 的 $queryRawUnsafe 寫法。兩張表分屬不同資料庫：twse-ts 的 isin_securities（目前上市中的
// 證券登記清單，用來篩出哪些 symbol 是特別股）跟 mops-ts 的 preferred_stock_right（發行條款，
// 20+ 欄位）。join key 是 isin_securities.symbol = preferred_stock_right.preferred_stock_code
// （已用 2026-09-06 實測資料驗證過：目前 28 檔上市中的特別股全部對得上）。2026-10-06 起上櫃從 tpex-ts 的
// tpex_preferred_stock 來（見 getPreferredStockSecurities）。preferred_stock_right 是 2026-09-08 的永久快照（mops 09-13 退役），
// 之後新發行的特別股不會有發行條款。

import { twseExportPrisma } from '@/infrastructure/prisma/twseExportClient';
import { tpexExportPrisma } from '@/infrastructure/prisma/tpexExportClient';
import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import { isUndefinedTableError } from '../mops/prismaErrors';
import { logger } from '@/infrastructure/logger';
import type { PreferredStockPort, PreferredStockRight, PreferredStockSecurity } from '@/application/ports/preferredStocks';

// DTO 型別 2026-09-17 Phase 4 搬到 application/ports/preferredStocks.ts，這裡 re-export 給既有 import 路徑。
export type { PreferredStockRight, PreferredStockSecurity };

interface RawIsinSecuritiesRow {
  symbol: string;
  name: string;
  isin_code: string | null;
  listed_date: Date | null;
  market_type: string;
  first_trade_date: Date | null;
}

// 2026-10-06 使用者拍板，三件事一起改：
// 1. 只取還在交易的（is_active，twse-ts 當天新加）：isin_securities 只增不刪，1522A 堤維西甲特 09-30 後不在行情裡卻一直被當成掛牌中。
//    is_active=false 也可能只是暫停交易而不是下市（twse-ts 欄位說明），1522A 是哪一種 mops 會重抓 profile 確認。
// 2. twse-ts 依證交所使用條款停抓 isin.twse.com.tw：之後新掛牌的 isin_code／listed_date 會是 null、name 會是代號本身。
//    isinCode 改成可為 null（沒有合法來源，不自己推算——照規則推算對不上的有 3/1,291）；listedDate 是 null 時改用行情裡的第一個交易日
//    （只在 null 時用：daily_price 從 2020-11 起，老特別股的第一個交易日不是上市日）。
// 3. 補上櫃：tpex-ts 的 export.tpex_preferred_stock（TPEx 自己的行情，is_listed = 出現在最新交易日），沒有 ISIN，上市日期同樣取第一個交易日
//    （8349A 是 2020-02-24，跟證交所 ISIN 頁登錄的一致）。
// 名稱不另外補：mops 的 preferred_stock_right 已在 2026-09-08 凍結（mops 09-13 退役該 domain），preferred_stock_name 是頁面原樣
// （全名、簡稱、純種類名都有），不能當簡稱用。
export const getPreferredStockSecurities = async (): Promise<PreferredStockSecurity[]> => {
  const [listed, otc] = await Promise.all([
    twseExportPrisma.$queryRaw<RawIsinSecuritiesRow[]>`
      SELECT i.symbol, i.name, i.isin_code, i.listing_date AS listed_date, i.market_type,
        CASE WHEN i.listing_date IS NULL THEN (SELECT MIN(trade_date) FROM "export"."v_daily_prices" d WHERE d.symbol = i.symbol) END AS first_trade_date
      FROM "export"."v_isin_securities" i
      WHERE i.security_type = '特別股' AND i.is_active
    `,
    tpexExportPrisma.$queryRaw<RawIsinSecuritiesRow[]>`
      SELECT p.symbol, p.name, NULL::text AS isin_code, NULL::date AS listed_date, '上櫃' AS market_type,
        (SELECT MIN(trade_date) FROM "export"."v_daily_prices" d WHERE d.symbol = p.symbol) AS first_trade_date
      FROM "export"."v_tpex_preferred_stocks" p
      WHERE p.is_listed
    `,
  ]);
  return [...listed, ...otc]
    .map((row) => ({
      symbol: row.symbol,
      name: row.name,
      isinCode: row.isin_code,
      listedDate: row.listed_date ?? row.first_trade_date,
      marketType: row.market_type,
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
};

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

// application/ports/preferredStocks.ts 的實作——src/bootstrap/deps.ts 綁進 AppDeps。
export const exchangePreferredStocks: PreferredStockPort = { getPreferredStockSecurities, getLatestPreferredStockRight };
