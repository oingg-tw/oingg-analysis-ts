import sitcaExportPrisma from '@/adapters/prisma/sitcaExportClient';
import { parseEtfCategory } from './parseCategory';
import { parseDistributionFrequency } from './parseDistribution';
import type { EtfRankingMetric, EtfRankingQuery, EtfRankingResult, EtfRankingRow } from './types';

interface RawBasicInfoRow {
  symbol: string;
  fund_name: string | null;
  security_short_name: string | null;
  company_name: string | null;
  category: string | null;
  distribution_class_info: string | null;
  is_actively_managed: boolean | null;
}

interface RawStatementRow {
  symbol: string;
  fund_tax_id: string | null;
  aum_twd: bigint | null;
  total_holders: bigint | null;
  subscription_amount_twd: bigint | null;
  redemption_amount_twd: bigint | null;
  dca_amount_twd: bigint | null;
  aum_below_statutory_threshold: boolean | null;
}

interface RawPerformanceRow {
  symbol: string;
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
  distributionClassInfo: string | null;
  isActive: boolean | null;
  belowStatutoryThreshold: boolean | null;
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
      SELECT symbol, fund_name, security_short_name, company_name, category, distribution_class_info, is_actively_managed
      FROM "export"."etf_basic_info"
      WHERE year_month = ${yearMonth}
    `,
    sitcaExportPrisma.$queryRaw<RawStatementRow[]>`
      SELECT symbol, fund_tax_id, aum_twd, total_holders, subscription_amount_twd, redemption_amount_twd, dca_amount_twd, aum_below_statutory_threshold
      FROM "export"."etf_monthly_statement"
      WHERE year_month = ${yearMonth}
    `,
  ]);

  const statementBySymbol = new Map(statementRows.map((row) => [row.symbol, row]));
  const rows: ResolvedRow[] = [];
  for (const basic of basicRows) {
    const stmt = statementBySymbol.get(basic.symbol);
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
      symbol: basic.symbol,
      fundName: basic.fund_name,
      shortName: basic.security_short_name,
      companyName: basic.company_name,
      category: basic.category,
      distributionClassInfo: basic.distribution_class_info,
      isActive: basic.is_actively_managed,
      belowStatutoryThreshold: stmt.aum_below_statutory_threshold,
      value,
      asOf: formatYearMonth(yearMonth),
    });
  }
  return rows;
};

// 報酬率——etf_performance 是累積報酬率（百分比），不是年化報酬率，join etf_basic_info 補
// 基金名稱/投信公司/分類；join etf_monthly_statement 只為了補 belowStatutoryThreshold 這個
// 額外顯示欄位，報酬率本身跟月快照無關。
const resolveReturnMetric = async (metric: EtfRankingMetric, yearMonth: string): Promise<ResolvedRow[]> => {
  const column = RETURN_COLUMN[metric];
  if (!column) return [];

  const [basicRows, performanceRows, statementRows] = await Promise.all([
    sitcaExportPrisma.$queryRaw<RawBasicInfoRow[]>`
      SELECT symbol, fund_name, security_short_name, company_name, category, distribution_class_info, is_actively_managed
      FROM "export"."etf_basic_info"
      WHERE year_month = ${yearMonth}
    `,
    sitcaExportPrisma.$queryRaw<RawPerformanceRow[]>`
      SELECT symbol, return_3m, return_6m, return_1y, return_2y, return_3y, return_5y, return_ytd, return_10y
      FROM "export"."etf_performance"
      WHERE year_month = ${yearMonth}
    `,
    sitcaExportPrisma.$queryRaw<{ symbol: string; aum_below_statutory_threshold: boolean | null }[]>`
      SELECT symbol, aum_below_statutory_threshold
      FROM "export"."etf_monthly_statement"
      WHERE year_month = ${yearMonth}
    `,
  ]);

  const performanceBySymbol = new Map(performanceRows.map((row) => [row.symbol, row]));
  const statementBySymbol = new Map(statementRows.map((row) => [row.symbol, row]));
  const rows: ResolvedRow[] = [];
  for (const basic of basicRows) {
    const perf = performanceBySymbol.get(basic.symbol);
    const rawValue = perf?.[column];
    if (rawValue === undefined || rawValue === null) continue;

    rows.push({
      symbol: basic.symbol,
      fundName: basic.fund_name,
      shortName: basic.security_short_name,
      companyName: basic.company_name,
      category: basic.category,
      distributionClassInfo: basic.distribution_class_info,
      isActive: basic.is_actively_managed,
      belowStatutoryThreshold: statementBySymbol.get(basic.symbol)?.aum_below_statutory_threshold ?? null,
      value: Number(rawValue),
      asOf: formatYearMonth(yearMonth),
    });
  }
  return rows;
};

// 總費用率——只用「最新一個完整年度」（今年還沒過完，不能拿來跟其他基金比，見
// route.ts 說明）。2026-09-06 起改吃 sitca-ts 的 fund_expense_ratio_annual_full_year
// view（取代原本自己用 established_date 判斷「這個基準年本身不滿一整年」的手動邏輯）——
// 那個手動邏輯只抓得到「當年新掛牌」，抓不到「當年中途清算/分割」這類同樣會讓 total_rate
// 只涵蓋部分期間的情況；sitca-ts 這個 view 用他們自己的 is_partial_year 判斷，涵蓋範圍
// 更完整（PROD 已驗證：17233/18444 列，1211 列被標記 is_partial_year 排除掉），不需要
// 再自己另外判斷發行日期。
const resolveExpenseRatioMetric = async (yearMonth: string): Promise<ResolvedRow[]> => {
  const latestCompleteYear = new Date().getFullYear() - 1;

  const [basicRows, statementRows, expenseRows] = await Promise.all([
    sitcaExportPrisma.$queryRaw<RawBasicInfoRow[]>`
      SELECT symbol, fund_name, security_short_name, company_name, category, distribution_class_info, is_actively_managed
      FROM "export"."etf_basic_info"
      WHERE year_month = ${yearMonth}
    `,
    sitcaExportPrisma.$queryRaw<{ symbol: string; fund_tax_id: string | null; aum_below_statutory_threshold: boolean | null }[]>`
      SELECT symbol, fund_tax_id, aum_below_statutory_threshold
      FROM "export"."etf_monthly_statement"
      WHERE year_month = ${yearMonth}
    `,
    sitcaExportPrisma.$queryRaw<{ fund_tax_id: string; total_rate: number | null }[]>`
      SELECT fund_tax_id, total_rate
      FROM "export"."fund_expense_ratio_annual_full_year"
      WHERE year = ${latestCompleteYear}
    `,
  ]);

  const statementBySymbol = new Map(statementRows.map((row) => [row.symbol, row]));
  const totalRateByFundTaxId = new Map(expenseRows.map((row) => [row.fund_tax_id, row.total_rate]));

  const rows: ResolvedRow[] = [];
  for (const basic of basicRows) {
    const statement = statementBySymbol.get(basic.symbol);
    if (!statement?.fund_tax_id) continue;
    const totalRate = totalRateByFundTaxId.get(statement.fund_tax_id);
    if (totalRate === undefined || totalRate === null) continue;

    rows.push({
      symbol: basic.symbol,
      fundName: basic.fund_name,
      shortName: basic.security_short_name,
      companyName: basic.company_name,
      category: basic.category,
      distributionClassInfo: basic.distribution_class_info,
      isActive: basic.is_actively_managed,
      belowStatutoryThreshold: statement.aum_below_statutory_threshold,
      value: Number(totalRate),
      asOf: String(latestCompleteYear),
    });
  }
  return rows;
};

// market/assetClass/isActive：2026-09-02 應使用者要求，把 category（例如「上市ETF_國外
// 成分證券ETF」）拆成獨立欄位，見 parseCategory.ts 的說明。
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

  const rankings: EtfRankingRow[] = sorted.map((row, index) => {
    const categoryDetail = parseEtfCategory(row.category);
    return {
      rank: index + 1,
      symbol: row.symbol,
      fundName: row.fundName,
      shortName: row.shortName,
      companyName: row.companyName,
      category: row.category,
      market: categoryDetail?.market ?? null,
      assetClass: categoryDetail?.assetClass ?? null,
      isActive: row.isActive,
      belowStatutoryThreshold: row.belowStatutoryThreshold,
      distributionFrequency: parseDistributionFrequency(row.distributionClassInfo),
      value: row.value,
      asOf: row.asOf,
    };
  });

  return { metric, order, limit, rankings, warnings };
};
