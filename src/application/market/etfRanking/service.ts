import type { AppDeps } from '@/application/deps';
import type { RawEtfPerformanceRow } from '@/application/ports/etfData';
import { parseEtfCategory } from '@/domain/market/etfRanking/parseCategory';
import { parseDistributionFrequency } from '@/domain/market/etfRanking/parseDistribution';
import type { EtfRankingMetric, EtfRankingQuery, EtfRankingResult, EtfRankingRow } from './types';

// 2026-09-17 Phase 4：從 http/modules/market/etfRanking/service.ts 搬來，sitca 查詢改走 deps.etfData，邏輯逐字不變。
export type EtfRankingDeps = Pick<AppDeps, 'etfData'>;

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
const RETURN_COLUMN: Partial<Record<EtfRankingMetric, keyof RawEtfPerformanceRow>> = {
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

// 規模/受益人數/淨申購贖回/定期定額——都是 etf_monthly_statement 當月快照的欄位（或欄位組合），
// join etf_basic_info 補基金名稱/投信公司/分類。netFlow = 申購金額 - 贖回金額，是本服務算的，
// 不是來源現成欄位。
const resolveSnapshotMetric = async (metric: EtfRankingMetric, yearMonth: string, deps: EtfRankingDeps): Promise<ResolvedRow[]> => {
  const [basicRows, statementRows] = await Promise.all([deps.etfData.listEtfBasicInfo(yearMonth), deps.etfData.listEtfMonthlyStatement(yearMonth)]);

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
const resolveReturnMetric = async (metric: EtfRankingMetric, yearMonth: string, deps: EtfRankingDeps): Promise<ResolvedRow[]> => {
  const column = RETURN_COLUMN[metric];
  if (!column) return [];

  const [basicRows, performanceRows, statementRows] = await Promise.all([
    deps.etfData.listEtfBasicInfo(yearMonth),
    deps.etfData.listEtfPerformance(yearMonth),
    deps.etfData.listEtfStatementThresholdFlags(yearMonth),
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
const resolveExpenseRatioMetric = async (yearMonth: string, deps: EtfRankingDeps): Promise<ResolvedRow[]> => {
  const latestCompleteYear = new Date().getFullYear() - 1;

  const [basicRows, statementRows, expenseRows] = await Promise.all([
    deps.etfData.listEtfBasicInfo(yearMonth),
    deps.etfData.listEtfStatementTaxIdAndThreshold(yearMonth),
    deps.etfData.listFullYearExpenseRatios(latestCompleteYear),
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
export const calculateEtfRanking = async (query: EtfRankingQuery, deps: EtfRankingDeps): Promise<EtfRankingResult> => {
  const { metric, order, limit } = query;
  const warnings: string[] = [];

  const yearMonth = await deps.etfData.getLatestEtfYearMonth();
  if (!yearMonth) {
    warnings.push('查無任何 ETF 資料。');
    return { metric, order, limit, rankings: [], warnings };
  }

  const resolved = metric === 'expenseRatio' ? await resolveExpenseRatioMetric(yearMonth, deps) : SNAPSHOT_METRICS.has(metric) ? await resolveSnapshotMetric(metric, yearMonth, deps) : await resolveReturnMetric(metric, yearMonth, deps);

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
