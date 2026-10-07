import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { type ComputationBatch, isComputationSkip, noQuarterBatch } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import type { AnnualIncomeStatement } from '@/application/ports/annualReport';
import type { BalanceSheetFields } from '@/application/ports/financialStatements';
import { calculateRoeWeighted5y, ROE_WEIGHTED_YEARS } from '@/domain/metrics/profitability/roeWeighted5y/calculateRoeWeighted5y';
import { roeWeighted5yDefinition } from '@/domain/metrics/profitability/roeWeighted5y/roeWeighted5yDefinition';
import { annualReportSlot, resolveAnnualReportContext, type AnnualReportContext } from '../../shared/annualReportSlot';

// 五年權益加權 ROE（見 roeWeighted5yDefinition 的說明）。窗口最後一年 = 最近一個完整年度（年報規則沿用 annualReportSlot：第四季算當年、
// 第一～三季算前一年；座標 (該年, 4)、knowledge date 是那份年報的公告日）。每年淨利、權益口徑跟 roe 的 FY 相同（合併總額，缺漏退回母公司）。
export type RoeWeighted5yDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'annualReports' | 'shares'>;

export interface RoeWeighted5yInputs {
  context: AnnualReportContext;
  rocYears: number[]; // 五個年度，舊到新
  annuals: (AnnualIncomeStatement | null)[]; // 對應 rocYears
  yearEndBalanceSheets: (BalanceSheetFields | null)[]; // 六個年底（rocYears[0]−1 … 最後一年），舊到新
  netIncomes: (bigint | null)[];
  yearEndEquities: (bigint | null)[];
}

const annualNetIncome = (annual: AnnualIncomeStatement | null): bigint | null => annual?.netIncome ?? annual?.netIncomeAttributableToParent ?? null;
const totalEquity = (bs: BalanceSheetFields | null): bigint | null => bs?.totalEquity ?? bs?.equityAttributableToParent ?? null;

export const resolveRoeWeighted5yInputs = async (query: QuarterlyMetricQuery, deps: RoeWeighted5yDeps): Promise<RoeWeighted5yInputs | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);
  if (!resolvedQuarter) return null;
  const context = await resolveAnnualReportContext({ symbol, rocYear: Number(resolvedQuarter.year), season: Number(resolvedQuarter.season), dataType, subsidiaryCompanyId }, deps);
  if (!context) return null;

  const lastRocYear = context.fiscalYear - 1911;
  const rocYears = Array.from({ length: ROE_WEIGHTED_YEARS }, (_, i) => lastRocYear - (ROE_WEIGHTED_YEARS - 1) + i);
  const key = { symbol, dataType, subsidiaryCompanyId };
  const [annuals, yearEndBalanceSheets] = await Promise.all([
    Promise.all(rocYears.map((rocYear) => (rocYear === lastRocYear ? Promise.resolve(context.annual) : deps.annualReports.getAnnualIncomeStatement({ ...key, rocYear })))),
    Promise.all([rocYears[0]! - 1, ...rocYears].map((year) => deps.statements.getBalanceSheet({ ...key, year, quarter: 4 }))),
  ]);
  return { context, rocYears, annuals, yearEndBalanceSheets, netIncomes: annuals.map(annualNetIncome), yearEndEquities: yearEndBalanceSheets.map(totalEquity) };
};

export type RoeWeighted5yComputationBatch = ComputationBatch<'fy'>;

export const computeRoeWeighted5y = async (query: QuarterlyMetricQuery, deps: RoeWeighted5yDeps): Promise<RoeWeighted5yComputationBatch> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;
  const inputs = await resolveRoeWeighted5yInputs(query, deps);
  if (!inputs) return noQuarterBatch(symbol, ['fy']);

  const slot = annualReportSlot(inputs.context, { symbol, metricCode: 'roeWeighted5y', dataType, subsidiaryCompanyId }, calculateRoeWeighted5y(inputs.netIncomes, inputs.yearEndEquities));
  const fy = isComputationSkip(slot) ? slot : { ...slot, formulaVersion: roeWeighted5yDefinition.currentFormulaVersion };
  const lastRocYear = String(inputs.context.fiscalYear - 1911);
  return { symbol, rocYear: lastRocYear, season: '4', slots: { fy } };
};
