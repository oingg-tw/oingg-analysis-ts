import type { AppDeps } from '@/application/deps';
import { breakDownBookValueChange, type BookValueBreakdown } from '@/domain/financials/bookValueBreakdown';
import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';

// 2026-09-27 淨值變動拆解（每股）——使用者問「怎麼看出推動淨值成長的來源組成」，選了流量拆解、每股呈現。拆法見
// domain/financials/bookValueBreakdown.ts。每年一列（權益變動表第四季＝全年，mops XBRL 109Q3 起，所以最早 2020 年）。
// 期初／期末股數＝前一年底／當年底的流通在外普通股，換算到今天的股數基準（跟 metric-history 的每股歷史同一個原則，
// 見 application/metrics/shared/restatePerShareHistory.ts）：分割、配股不會被當成「股數變動影響」，期末每股淨值也跟 bvps 走勢對得上。
export interface BookValueBreakdownEntry extends BookValueBreakdown {
  fiscalYear: number;
}

export interface BookValueBreakdownResult {
  symbol: string;
  entries: BookValueBreakdownEntry[]; // 舊 → 新
}

export type BookValueBreakdownDeps = Pick<AppDeps, 'equityChanges' | 'shares' | 'reportAvailability'>;

export const getCompanyBookValueBreakdown = async (symbol: string, deps: BookValueBreakdownDeps): Promise<BookValueBreakdownResult> => {
  // 2026-09-27 每一年用那一年的財報口徑（domain/financials/reportDataType.ts），改只編個體報表的公司歷史才接得起來。
  const [consolidated, individual] = await Promise.all([deps.equityChanges.listAnnualEquityChanges(symbol, '2'), deps.equityChanges.listAnnualEquityChanges(symbol, '1')]);
  const keep = await Promise.all(
    [...consolidated.map((y) => ({ y, type: '2' })), ...individual.map((y) => ({ y, type: '1' }))].map(async ({ y, type }) =>
      (await deps.reportAvailability.resolveDataTypeForPeriod(symbol, y.rocYear, 4)) === type ? y : null
    )
  );
  const years = keep.filter((y) => y !== null).sort((a, b) => a.rocYear - b.rocYear);
  if (years.length === 0) return { symbol, entries: [] };

  const now = new Date();
  const { basisMultiplier } = await deps.shares.getShareBasisEvents(symbol, now, now);
  const sharesOnTodayBasis = async (date: Date) => {
    const s = await deps.shares.getOutstandingCommonShares(symbol, date);
    if (!s) return null;
    const factor = (await deps.shares.getShareSplitFactor(symbol, date, now)) * basisMultiplier;
    return { shares: Number(s.outstandingCommonShares) * factor, preferredCapitalThousands: Number(s.preferredClaimThousands) };
  };

  const entries: BookValueBreakdownEntry[] = [];
  for (const y of years) {
    const fiscalYear = rocYearToGregorian(y.rocYear);
    const [opening, closing] = await Promise.all([sharesOnTodayBasis(new Date(Date.UTC(fiscalYear - 1, 11, 31))), sharesOnTodayBasis(new Date(Date.UTC(fiscalYear, 11, 31)))]);
    if (!opening || !closing) continue;
    const breakdown = breakDownBookValueChange(
      y,
      { opening: opening.preferredCapitalThousands, closing: closing.preferredCapitalThousands },
      { opening: opening.shares, closing: closing.shares }
    );
    if (breakdown) entries.push({ fiscalYear, ...breakdown });
  }
  return { symbol, entries };
};
