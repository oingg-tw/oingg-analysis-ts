import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

// 2026-09-25 流通在外普通股要從已發行股數扣掉的兩項（見 domain/financials/outstandingCommonShares.ts）：
// 特別股股本（千元）與庫藏股股數（股）。都是**季末餘額**，取 asOf 當下已結束的最近一季；合併報表優先，沒有才用個體。
// 三張表各業態一張（mops-ts 2026-09-25 確認欄位語意）：
//   金控  financial_holding_balance_sheet_detail_xbrl：preferred_stock、number_of_treasury_stock_acquired_by_the_compa_7fb149e6（109 起）
//   銀行  bank_balance_sheet_detail_xbrl：number_of_treasury_share_acquired_by_the_company_fc4c4d；**特別股股本沒收**
//   一般  quarterly_balance_sheet_xbrl：preference_share、number_of_shares_held_by_entity_and_subsidiaries（107 起，0 是明確申報的 0）
// 金控／銀行表對每家公司都有列、不適用的欄位是 null，所以只認「有值」的列。不要用 treasury_shares（那是金額）。
export interface ShareAdjustments {
  preferredCapitalThousands: bigint | null;
  treasuryShares: bigint | null;
}

// asOf 當下「已經結束」的最近一季，民國年*10+季。
export const latestEndedRocQuarterCode = (asOf: Date): number => {
  let y = asOf.getUTCFullYear();
  let q = Math.ceil((asOf.getUTCMonth() + 1) / 3);
  const quarterEnd = new Date(Date.UTC(y, q * 3, 0));
  if (asOf < quarterEnd) {
    q -= 1;
    if (q === 0) { q = 4; y -= 1; }
  }
  return (y - 1911) * 10 + q;
};

export const getShareAdjustmentsAsOf = async (symbol: string, asOf: Date): Promise<ShareAdjustments> => {
  const code = latestEndedRocQuarterCode(asOf);
  const [fh, bank, general] = await Promise.all([
    mopsExportPrisma.$queryRaw<{ pref: bigint | null; tr: bigint | null }[]>`
      SELECT preferred_stock AS pref, number_of_treasury_stock_acquired_by_the_compa_7fb149e6 AS tr
      FROM "export"."financial_holding_balance_sheet_detail_xbrl"
      WHERE symbol = ${symbol} AND subsidiary_company_id = '' AND year * 10 + quarter <= ${code}
        AND (preferred_stock IS NOT NULL OR number_of_treasury_stock_acquired_by_the_compa_7fb149e6 IS NOT NULL)
      ORDER BY year DESC, quarter DESC, data_type DESC LIMIT 1`,
    mopsExportPrisma.$queryRaw<{ tr: bigint | null }[]>`
      SELECT number_of_treasury_share_acquired_by_the_company_fc4c4d AS tr
      FROM "export"."bank_balance_sheet_detail_xbrl"
      WHERE symbol = ${symbol} AND subsidiary_company_id = '' AND year * 10 + quarter <= ${code}
        AND number_of_treasury_share_acquired_by_the_company_fc4c4d IS NOT NULL
      ORDER BY year DESC, quarter DESC, data_type DESC LIMIT 1`,
    mopsExportPrisma.$queryRaw<{ pref: bigint | null; tr: bigint | null }[]>`
      SELECT preference_share AS pref, number_of_shares_held_by_entity_and_subsidiaries AS tr
      FROM "export"."quarterly_balance_sheet_xbrl"
      WHERE symbol = ${symbol} AND subsidiary_company_id = '' AND year * 10 + quarter <= ${code}
        AND (preference_share IS NOT NULL OR number_of_shares_held_by_entity_and_subsidiaries IS NOT NULL)
      ORDER BY year DESC, quarter DESC, data_type DESC LIMIT 1`,
  ]);
  if (fh[0]) return { preferredCapitalThousands: fh[0].pref, treasuryShares: fh[0].tr };
  if (bank[0]) return { preferredCapitalThousands: null, treasuryShares: bank[0].tr };
  if (general[0]) return { preferredCapitalThousands: general[0].pref, treasuryShares: general[0].tr };
  return { preferredCapitalThousands: null, treasuryShares: null };
};

// 「這家公司有特別股」：股利公告裡有它的特別股代號（例 2838A）發過特別股股利。每個程序載入一次（全表一次查詢）。
// 用來抓「有特別股、卻查不到特別股股本」的公司（目前是銀行）——那種情況分母回 null，不猜。
// ponytail: 全程序快取、不看 asOf——特別股贖回後幾年內仍會被當成發行人（查得到股本時不受影響，只影響查不到股本的那幾家）。
let preferredIssuers: Promise<Set<string>> | null = null;
export const isKnownPreferredIssuer = async (symbol: string): Promise<boolean> => {
  preferredIssuers ??= mopsExportPrisma
    .$queryRaw<{ base: string }[]>`
      SELECT DISTINCT substring(symbol from 1 for 4) AS base FROM "export"."dividend_distribution"
      WHERE symbol ~ '^[0-9]{4}[A-Z]' AND preferred_stock_cash_dividend > 0`
    .then((rows) => new Set(rows.map((r) => r.base)))
    .catch((error: unknown) => {
      preferredIssuers = null;
      throw error;
    });
  return (await preferredIssuers).has(symbol);
};
