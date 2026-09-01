import sitcaExportPrisma from '@/adapters/prisma/sitcaExportClient';
import type { EtfRankingMetric, EtfRankingQuery, EtfRankingResult, EtfRankingRow } from './types';

interface RawBasicInfoRow {
  security_code: string;
  fund_name: string | null;
  security_short_name: string | null;
  company_name: string | null;
  category: string | null;
}

interface RawBasicInfoWithEstablishedRow extends RawBasicInfoRow {
  established_date: Date | null;
}

interface RawStatementRow {
  security_code: string;
  fund_tax_id: string | null;
  aum_twd: bigint | null;
  total_holders: bigint | null;
  subscription_amount_twd: bigint | null;
  redemption_amount_twd: bigint | null;
  dca_amount_twd: bigint | null;
}

interface RawPerformanceRow {
  security_code: string;
  return_3m: number | null;
  return_6m: number | null;
  return_1y: number | null;
  return_2y: number | null;
  return_3y: number | null;
  return_5y: number | null;
  return_ytd: number | null;
  return_10y: number | null;
}

interface ResolvedRow {
  symbol: string;
  fundName: string | null;
  shortName: string | null;
  companyName: string | null;
  category: string | null;
  value: number;
  asOf: string;
}

const SNAPSHOT_METRICS = new Set<EtfRankingMetric>(['aum', 'holders', 'netFlow', 'dcaAmount']);
const RETURN_COLUMN: Partial<Record<EtfRankingMetric, keyof RawPerformanceRow>> = {
  return3m: 'return_3m',
  return6m: 'return_6m',
  return1y: 'return_1y',
  return2y: 'return_2y',
  return3y: 'return_3y',
  return5y: 'return_5y',
  returnYtd: 'return_ytd',
  return10y: 'return_10y',
};

const formatYearMonth = (yearMonth: string): string => `${yearMonth.slice(0, 4)}-${yearMonth.slice(4, 6)}`;

const getLatestYearMonth = async (): Promise<string | null> => {
  const rows = await sitcaExportPrisma.$queryRaw<{ year_month: string | null }[]>`
    SELECT MAX(year_month) as year_month FROM "export"."etf_basic_info"
  `;
  return rows[0]?.year_month ?? null;
};

// 規模/受益人數/淨申購贖回/定期定額——都是 etf_monthly_statement 當月快照的欄位（或欄位組合），
// join etf_basic_info 補基金名稱/投信公司/分類。netFlow = 申購金額 - 贖回金額，是本服務算的，
// 不是來源現成欄位。
const resolveSnapshotMetric = async (metric: EtfRankingMetric, yearMonth: string): Promise<ResolvedRow[]> => {
  const [basicRows, statementRows] = await Promise.all([
    sitcaExportPrisma.$queryRaw<RawBasicInfoRow[]>`
      SELECT security_code, fund_name, security_short_name, company_name, category
      FROM "export"."etf_basic_info"
      WHERE year_month = ${yearMonth}
    `,
    sitcaExportPrisma.$queryRaw<RawStatementRow[]>`
      SELECT security_code, fund_tax_id, aum_twd, total_holders, subscription_amount_twd, redemption_amount_twd, dca_amount_twd
      FROM "export"."etf_monthly_statement"
      WHERE year_month = ${yearMonth}
    `,
  ]);

  const statementBySymbol = new Map(statementRows.map((row) => [row.security_code, row]));
  const rows: ResolvedRow[] = [];
  for (const basic of basicRows) {
    const stmt = statementBySymbol.get(basic.security_code);
    if (!stmt) continue;

    let value: number | null;
    switch (metric) {
      case 'aum':
        value = stmt.aum_twd === null ? null : Number(stmt.aum_twd);
        break;
      case 'holders':
        value = stmt.total_holders === null ? null : Number(stmt.total_holders);
        break;
      case 'netFlow':
        value =
          stmt.subscription_amount_twd === null || stmt.redemption_amount_twd === null
            ? null
            : Number(stmt.subscription_amount_twd) - Number(stmt.redemption_amount_twd);
        break;
      case 'dcaAmount':
        value = stmt.dca_amount_twd === null ? null : Number(stmt.dca_amount_twd);
        break;
      default:
        value = null;
    }
    if (value === null) continue;

    rows.push({
      symbol: basic.security_code,
      fundName: basic.fund_name,
      shortName: basic.security_short_name,
      companyName: basic.company_name,
      category: basic.category,
      value,
      asOf: formatYearMonth(yearMonth),
    });
  }
  return rows;
};

// 報酬率——etf_performance 是累積報酬率（百分比），不是年化報酬率，join etf_basic_info 補
// 基金名稱/投信公司/分類。
const resolveReturnMetric = async (metric: EtfRankingMetric, yearMonth: string): Promise<ResolvedRow[]> => {
  const column = RETURN_COLUMN[metric];
  if (!column) return [];

  const [basicRows, performanceRows] = await Promise.all([
    sitcaExportPrisma.$queryRaw<RawBasicInfoRow[]>`
      SELECT security_code, fund_name, security_short_name, company_name, category
      FROM "export"."etf_basic_info"
      WHERE year_month = ${yearMonth}
    `,
    sitcaExportPrisma.$queryRaw<RawPerformanceRow[]>`
      SELECT security_code, return_3m, return_6m, return_1y, return_2y, return_3y, return_5y, return_ytd, return_10y
      FROM "export"."etf_performance"
      WHERE year_month = ${yearMonth}
    `,
  ]);

  const performanceBySymbol = new Map(performanceRows.map((row) => [row.security_code, row]));
  const rows: ResolvedRow[] = [];
  for (const basic of basicRows) {
    const perf = performanceBySymbol.get(basic.security_code);
    const rawValue = perf?.[column];
    if (rawValue === undefined || rawValue === null) continue;

    rows.push({
      symbol: basic.security_code,
      fundName: basic.fund_name,
      shortName: basic.security_short_name,
      companyName: basic.company_name,
      category: basic.category,
      value: Number(rawValue),
      asOf: formatYearMonth(yearMonth),
    });
  }
  return rows;
};

// 總費用率——只用「最新一個完整年度」（今年還沒過完，不能拿來跟其他基金比，見
// route.ts 說明）。發行日期落在這個完整年度（或更晚）的 ETF，代表它在這個基準年度本身就不滿
// 一整年，沒有可比的完整年度資料，直接排除，不套用其他年度或做時間比例換算——2026-09-02
// 應使用者要求，統一用同一個基準年比較才公平，不同基金各自套不同年度會失去排行的意義。
const resolveExpenseRatioMetric = async (yearMonth: string): Promise<ResolvedRow[]> => {
  const latestCompleteYear = new Date().getFullYear() - 1;

  const [basicRows, statementRows, expenseRows] = await Promise.all([
    sitcaExportPrisma.$queryRaw<RawBasicInfoWithEstablishedRow[]>`
      SELECT security_code, fund_name, security_short_name, company_name, category, established_date
      FROM "export"."etf_basic_info"
      WHERE year_month = ${yearMonth}
    `,
    sitcaExportPrisma.$queryRaw<{ security_code: string; fund_tax_id: string | null }[]>`
      SELECT security_code, fund_tax_id
      FROM "export"."etf_monthly_statement"
      WHERE year_month = ${yearMonth}
    `,
    sitcaExportPrisma.$queryRaw<{ fund_id: string; total_rate: number | null }[]>`
      SELECT fund_id, total_rate
      FROM "export"."fund_expense_ratio_annual"
      WHERE year = ${latestCompleteYear}
    `,
  ]);

  const fundTaxIdBySymbol = new Map(statementRows.map((row) => [row.security_code, row.fund_tax_id]));
  const totalRateByFundId = new Map(expenseRows.map((row) => [row.fund_id, row.total_rate]));

  const rows: ResolvedRow[] = [];
  for (const basic of basicRows) {
    if (basic.established_date === null) continue;
    if (basic.established_date.getUTCFullYear() >= latestCompleteYear) continue; // 這個基準年本身不滿一整年，排除。

    const fundTaxId = fundTaxIdBySymbol.get(basic.security_code);
    if (!fundTaxId) continue;
    const totalRate = totalRateByFundId.get(fundTaxId);
    if (totalRate === undefined || totalRate === null) continue;

    rows.push({
      symbol: basic.security_code,
      fundName: basic.fund_name,
      shortName: basic.security_short_name,
      companyName: basic.company_name,
      category: basic.category,
      value: Number(totalRate),
      asOf: String(latestCompleteYear),
    });
  }
  return rows;
};

export const calculateEtfRanking = async (query: EtfRankingQuery): Promise<EtfRankingResult> => {
  const { metric, order, limit } = query;
  const warnings: string[] = [];

  const yearMonth = await getLatestYearMonth();
  if (!yearMonth) {
    warnings.push('查無任何 ETF 資料。');
    return { metric, order, limit, rankings: [], warnings };
  }

  const resolved = metric === 'expenseRatio' ? await resolveExpenseRatioMetric(yearMonth) : SNAPSHOT_METRICS.has(metric) ? await resolveSnapshotMetric(metric, yearMonth) : await resolveReturnMetric(metric, yearMonth);

  if (resolved.length === 0) {
    warnings.push(`查無符合條件（${metric} 有值）的 ETF，無法排行。`);
  }

  const sorted = [...resolved].sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value)).slice(0, limit);

  const rankings: EtfRankingRow[] = sorted.map((row, index) => ({
    rank: index + 1,
    symbol: row.symbol,
    fundName: row.fundName,
    shortName: row.shortName,
    companyName: row.companyName,
    category: row.category,
    value: row.value,
    asOf: row.asOf,
  }));

  return { metric, order, limit, rankings, warnings };
};
