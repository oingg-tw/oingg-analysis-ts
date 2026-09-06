// 特別股（preferred_stock）的即時查詢層——比照 mopsQuarterlyStatements.ts/bankRegulatoryXbrl.ts
// 的 $queryRawUnsafe 寫法。兩張表分屬不同資料庫：twse-ts 的 isin_securities（目前上市中的
// 證券登記清單，用來篩出哪些 symbol 是特別股）跟 mops-ts 的 preferred_stock_right（發行條款，
// 20+ 欄位）。join key 是 isin_securities.symbol = preferred_stock_right.preferred_stock_code
// （已用 2026-09-06 實測資料驗證過：目前 28 檔上市中的特別股全部對得上）。TPEx（上櫃）目前
// 沒有 isin_securities 這張表，這批只能涵蓋上市（TWSE）。

import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import { mopsExportPrisma } from '@/adapters/prisma/mopsExportClient';

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
  // 從 redemptionConditions 自由格式文字 parse 出來的「發行後幾年才可贖回」——這是發行人
  // 贖回權（call）的保護期，不是投資人賣回權（put，這批資料源沒有這個概念，見
  // 2026-09-06 跟 web-nuxt 確認過的說明）。parse 不出來（redeemable=false，或文字裡沒有
  // 「X年」這種可辨識的期間敘述，例如 2883B/2887Z1 引用公司章程而不寫年限）時為 null，
  // 不代表這批一定沒有贖回權，只是原始文字沒有結構化年限可抓。
  callProtectionYears: number | null;
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
}

const toDecimalNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

// redemption_conditions 是自由格式中文條款文字，2026-09-06 逐一核對過目前 28 檔上市中特別股
// 的實際文字，格式是「(本公司/本行)得於發行(日/屆滿)X年(Y個月)之次日起...收回」這種句型，
// X/Y 有時是阿拉伯數字（含小數，例如 5.5 年）、有時是中文數字（五年、七年、五年六個月）。
// 只支援一到十的中文數字——目前真實資料沒有超過十年的案例，遇到超過十年的敘述會 parse
// 不出來（回傳 null），不是誤判。
const CHINESE_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

const parseYearOrMonthToken = (token: string): number => (token in CHINESE_DIGITS ? CHINESE_DIGITS[token]! : Number(token));

// 抓「X年」或「X年Y個月」，回傳換算成年的小數（Y個月 = Y/12 年，四捨五入到小數 2 位）。
// 抓不到「年」這個字直接相鄰的數字/中文數字就回傳 null——不勉強從整段文字猜期間。
const extractCallProtectionYears = (conditions: string | null): number | null => {
  if (!conditions) return null;
  const match = conditions.match(/(\d+(?:\.\d+)?|[一二三四五六七八九十])年(?:([一二三四五六七八九十]|\d+)個月)?/);
  if (!match) return null;
  const years = parseYearOrMonthToken(match[1]!);
  const months = match[2] ? parseYearOrMonthToken(match[2]) : 0;
  return Math.round((years + months / 12) * 100) / 100;
};

// 同一個 preferred_stock_code 會有多列（series_no 遞增）代表配息條件歷次修訂（例如發行後
// 幾年重新訂價），取最新一次修訂的條款——不能假設一個 code 只有一列。
export const getLatestPreferredStockRight = async (preferredStockCode: string): Promise<PreferredStockRight | null> => {
  const rows = await mopsExportPrisma.$queryRaw<RawPreferredStockRightRow[]>`
    SELECT issue_date, issue_price, dividend_rate, cumulative_dividend, participating_excess_dividend,
      liquidation_preference, voting_rights, convertible, conversion_start_date, redeemable,
      redemption_date, redemption_conditions
    FROM "export"."preferred_stock_right"
    WHERE preferred_stock_code = ${preferredStockCode}
    ORDER BY series_no DESC LIMIT 1
  `;
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
    callProtectionYears: extractCallProtectionYears(row.redemption_conditions),
  };
};
