import { mopsExportPrisma } from '@/infrastructure/prisma/mopsExportClient';
import type { AnnualEquityChangeRow, EquityChangePort } from '@/application/ports/equityChanges';
import { latestEndedRocQuarterCode } from './shareAdjustments';

// 2026-09-25 權益變動表（mops-ts export.equity_change_xbrl，逐 member 有期初／變動／期末）——只讀特別股現金股利。
// 取 TotalEquityMember 那一列（權益合計欄），值是**年初至今累計、宣告時認列**（股東會約在第二季，所以 Q2~Q4 同值），
// 存成負數（權益減少），這裡轉成正數。沒有特別股的公司這一欄是 null，當成 0。合併報表優先。
// 已驗證（113 年）：(歸屬母公司淨利 − 這個數) ÷ 年報 EPS 跟普通股股數吻合到千分之幾（2881 1.000、2882 0.999），
// 所以官方 EPS 扣掉的就是這個數。
// 近四季 = YTD(本季) + YTD(去年Q4) − YTD(去年同季)；第四季就是 YTD(本季)。
export const getPreferredDividendsTtmAsOf = async (symbol: string, asOf: Date): Promise<bigint> => {
  const code = latestEndedRocQuarterCode(asOf);
  const y = Math.floor(code / 10);
  const q = code % 10;
  const rows = await mopsExportPrisma.$queryRaw<{ year: number; quarter: number; v: bigint | null }[]>`
    SELECT DISTINCT ON (year, quarter) year, quarter, cash_dividends_of_preference_share AS v
    FROM "export"."equity_change_xbrl"
    WHERE symbol = ${symbol} AND member = 'TotalEquityMember'
      AND ((year = ${y} AND quarter = ${q}) OR (year = ${y - 1} AND quarter IN (${q}, 4)))
    ORDER BY year, quarter, data_type DESC`;
  const ytd = (yy: number, qq: number): bigint => {
    const v = rows.find((r) => r.year === yy && r.quarter === qq)?.v ?? 0n;
    return v < 0n ? -v : v;
  };
  const ttm = q === 4 ? ytd(y, 4) : ytd(y, q) + ytd(y - 1, 4) - ytd(y - 1, q);
  return ttm > 0n ? ttm : 0n;
};

// 2026-09-27 淨值變動拆解（application/ports/equityChanges.ts）：第四季（全年）歸屬母公司權益那一欄。沒有非控制權益的公司
// 不一定申報 EquityAttributableToOwnersOfParentMember，那時權益合計就是歸屬母公司，退回 TotalEquityMember。
// 期初有追溯重編時用重編後（重編不是當年度的流量）。
export const listAnnualEquityChanges = async (symbol: string, dataType: '1' | '2'): Promise<AnnualEquityChangeRow[]> => {
  const rows = await mopsExportPrisma.$queryRaw<
    { year: number; o: number | null; c: number | null; ni: number | null; oci: number | null; div: number | null; pdiv: number | null; issued: number | null }[]
  >`
    SELECT DISTINCT ON (year) year,
      COALESCE(opening_balance_after_restatement, opening_balance)::float8 AS o, closing_balance::float8 AS c,
      profit_loss::float8 AS ni, other_comprehensive_income::float8 AS oci,
      cash_dividends_of_ordinary_share::float8 AS div, cash_dividends_of_preference_share::float8 AS pdiv,
      (COALESCE(issue_of_shares, 0) + COALESCE(due_to_recognition_of_equity_component_of_convertible_bonds, 0)
        + COALESCE(shares_issued_for_pursuant_to_reorganization, 0))::float8 AS issued
    FROM "export"."equity_change_xbrl"
    WHERE symbol = ${symbol} AND quarter = 4 AND data_type = ${dataType} AND subsidiary_company_id = ''
      AND member IN ('EquityAttributableToOwnersOfParentMember', 'TotalEquityMember')
    ORDER BY year, (member = 'EquityAttributableToOwnersOfParentMember') DESC`;
  return rows
    .filter((r) => r.o !== null && r.c !== null)
    .map((r) => ({
      rocYear: r.year,
      openingEquityThousands: r.o!,
      closingEquityThousands: r.c!,
      netIncomeThousands: r.ni ?? 0,
      otherComprehensiveIncomeThousands: r.oci ?? 0,
      commonCashDividendsThousands: r.div ?? 0,
      preferredCashDividendsThousands: r.pdiv ?? 0,
      capitalIssuedThousands: r.issued ?? 0,
    }));
};

export const mopsEquityChanges: EquityChangePort = { listAnnualEquityChanges };
