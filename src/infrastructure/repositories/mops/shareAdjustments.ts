import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';

// 2026-09-25 流通在外普通股要從已發行股數扣掉的兩項（見 domain/financials/outstandingCommonShares.ts）：
// 特別股股本（千元）與庫藏股股數（股）。都是**季末餘額**，取 asOf 當下已結束的最近一季；合併報表優先，沒有才用個體。
// 三張表各業態一張（mops-ts 2026-09-25 確認欄位語意）：
//   金控  financial_holding_balance_sheet_detail_xbrl：preferred_stock、number_of_treasury_stock_acquired_by_the_compa_7fb149e6（109 起）
//   銀行  bank_balance_sheet_detail_xbrl：number_of_treasury_share_acquired_by_the_company_fc4c4d、preferred_stock（2026-09-27 mops-ts 補上，
//         目前只有 2836、2838、2897 的 114Q4——更早的季度仍查不到，那幾季照舊回 null）
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
    // 銀行表的庫藏股每季都有、特別股股本只有少數季，兩個各取 asOf 前最近一筆有值的（特別股股本很少變動）。
    mopsExportPrisma.$queryRaw<{ pref: bigint | null; tr: bigint | null }[]>`
      SELECT
        (SELECT preferred_stock FROM "export"."bank_balance_sheet_detail_xbrl"
          WHERE symbol = ${symbol} AND subsidiary_company_id = '' AND year * 10 + quarter <= ${code} AND preferred_stock IS NOT NULL
          ORDER BY year DESC, quarter DESC, data_type DESC LIMIT 1) AS pref,
        (SELECT number_of_treasury_share_acquired_by_the_company_fc4c4d FROM "export"."bank_balance_sheet_detail_xbrl"
          WHERE symbol = ${symbol} AND subsidiary_company_id = '' AND year * 10 + quarter <= ${code} AND number_of_treasury_share_acquired_by_the_company_fc4c4d IS NOT NULL
          ORDER BY year DESC, quarter DESC, data_type DESC LIMIT 1) AS tr`,
    mopsExportPrisma.$queryRaw<{ pref: bigint | null; tr: bigint | null }[]>`
      SELECT preference_share AS pref, number_of_shares_held_by_entity_and_subsidiaries AS tr
      FROM "export"."quarterly_balance_sheet_xbrl"
      WHERE symbol = ${symbol} AND subsidiary_company_id = '' AND year * 10 + quarter <= ${code}
        AND (preference_share IS NOT NULL OR number_of_shares_held_by_entity_and_subsidiaries IS NOT NULL)
      ORDER BY year DESC, quarter DESC, data_type DESC LIMIT 1`,
  ]);
  if (fh[0]) return { preferredCapitalThousands: fh[0].pref, treasuryShares: fh[0].tr };
  if (bank[0] && (bank[0].pref !== null || bank[0].tr !== null)) return { preferredCapitalThousands: bank[0].pref, treasuryShares: bank[0].tr };
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

// 2026-09-27 特別股扣發行價（domain/financials/outstandingCommonShares.ts preferredClaimThousands）的輸入：各檔特別股（代號＝普通股代號＋英文字母，
// 2887Z1 這種帶數字的也算）最接近 asOf 的一次股利分派的參與股數，配上特別股權利表最新一版的發行價。
// 窗口 asOf 前 18 個月到後 12 個月：特別股多半一年配一次；新發行的第一次配息會晚於發行（2887 併新光後的 G／H 第一次配息 2026-07-01，
// 但 114Q3 起就在股本裡）。借用的是「那一檔有幾股」這個發行當下就確定的事實，而且 domain 端要股數加總對上當季資產負債表的特別股股本才採用。
// 贖回後就不會再有分派，自然掉出清單。另外回傳這家公司特別股權利表裡所有的發行價，給「沒有分派紀錄、但只有一種發行價」時用（6958）。
export const getPreferredSeriesAsOf = async (
  symbol: string,
  asOf: Date
): Promise<{ series: { participatingShares: number; issuePrice: number }[]; knownIssuePrices: number[] }> => {
  const since = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 18, asOf.getUTCDate()));
  const until = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 12, asOf.getUTCDate()));
  const pattern = `^${symbol}[A-Z][0-9]?$`;
  const [rows, prices] = await Promise.all([
    mopsExportPrisma.$queryRaw<{ tps: number | null; price: number | null }[]>`
      WITH ev AS (
        SELECT DISTINCT ON (symbol) symbol AS code, total_participating_shares::float8 AS tps
        FROM "export"."dividend_distribution"
        WHERE symbol ~ ${pattern} AND total_participating_shares > 0
          AND COALESCE(ex_dividend_date, announcement_date) > ${since} AND COALESCE(ex_dividend_date, announcement_date) <= ${until}
        ORDER BY symbol, (COALESCE(ex_dividend_date, announcement_date) > ${asOf}),
          ABS(COALESCE(ex_dividend_date, announcement_date) - ${asOf}::date)),
      pr AS (
        SELECT DISTINCT ON (preferred_stock_code) preferred_stock_code AS code, issue_price::float8 AS price
        FROM "export"."preferred_stock_right" WHERE symbol = ${symbol}
        ORDER BY preferred_stock_code, series_no DESC)
      SELECT ev.tps, pr.price FROM ev JOIN pr USING (code)`,
    mopsExportPrisma.$queryRaw<{ price: number }[]>`
      SELECT DISTINCT issue_price::float8 AS price FROM "export"."preferred_stock_right" WHERE symbol = ${symbol} AND issue_price > 0`,
  ]);
  return {
    series: rows.filter((r) => r.tps && r.price).map((r) => ({ participatingShares: r.tps!, issuePrice: r.price! })),
    knownIssuePrices: prices.map((p) => p.price),
  };
};
