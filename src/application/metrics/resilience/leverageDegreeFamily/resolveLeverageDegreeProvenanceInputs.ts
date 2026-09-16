import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { toPerShare } from '@/domain/metrics/shared/numericHelpers';
import { pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domain/metrics/shared/pickers';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/infrastructure/repositories/mops/incomeStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/infrastructure/repositories/mops/capitalStock';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';

// 2026-09-13 使用者要求擴大稽核鏈——financialLeverageDegree(DFL)/totalLeverageDegree(DTL)
// 都是「本季 vs 去年同季」的 YoY 比較，且都需要先組出 EPS（淨利/流通股數）當分子，
// 兩支共用完全同一組輸入，抽這支共用 resolver。淨利/EBIT(=營業利益)/營收各自需要本季+
// 去年同季兩筆，流通股數是「非財報欄位」（公開發行公司股本變動申報），不是 statementField。

export const growthPct = (current: number | null, prior: number | null): number | null =>
  current !== null && prior !== null && prior !== 0 ? Math.round(((current - prior) / Math.abs(prior)) * 100 * 100) / 100 : null;

export interface QuarterSnapshot {
  fiscalYear: number;
  fiscalQuarter: number;
  netIncome: PickedField;
  shares: bigint | null;
  operatingIncome: bigint | null;
  operatingRevenue: bigint | null;
  eps: number | null;
}

export interface LeverageDegreeProvenanceInputs {
  symbol: string;
  fiscalYear: number;
  fiscalQuarter: number;
  current: QuarterSnapshot;
  prior: QuarterSnapshot;
}

export const resolveLeverageDegreeProvenanceInputs = async (query: QuarterlyMetricQuery): Promise<LeverageDegreeProvenanceInputs | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement']);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const currentIncomeStatement = await getQuarterlyIncomeStatement(key);
  const reportDate = currentIncomeStatement?.reportDate ?? null;

  const priorQuarter = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorIncomeStatement = await getQuarterlyIncomeStatement({
    symbol,
    year: Number(priorQuarter.year),
    quarter: Number(priorQuarter.season),
    dataType,
    subsidiaryCompanyId,
  });

  const [currentShares, priorShares] = await Promise.all([
    reportDate ? getPaidInSharesAsOf(symbol, reportDate) : null,
    priorIncomeStatement?.reportDate ? getPaidInSharesAsOf(symbol, priorIncomeStatement.reportDate) : null,
  ]);

  const currentNetIncome = pickNetIncome(currentIncomeStatement);
  const priorNetIncome = pickNetIncome(priorIncomeStatement);
  const currentEps = currentNetIncome.value !== null && currentShares !== null ? toPerShare(currentNetIncome.value, currentShares.paidInShares) : null;
  const priorEps = priorNetIncome.value !== null && priorShares !== null ? toPerShare(priorNetIncome.value, priorShares.paidInShares) : null;

  return {
    symbol,
    fiscalYear,
    fiscalQuarter: seasonNum,
    current: {
      fiscalYear,
      fiscalQuarter: seasonNum,
      netIncome: currentNetIncome,
      shares: currentShares?.paidInShares ?? null,
      operatingIncome: currentIncomeStatement?.operatingIncome ?? null,
      operatingRevenue: currentIncomeStatement?.operatingRevenue ?? null,
      eps: currentEps,
    },
    prior: {
      fiscalYear: rocYearToGregorian(Number(priorQuarter.year)),
      fiscalQuarter: Number(priorQuarter.season),
      netIncome: priorNetIncome,
      shares: priorShares?.paidInShares ?? null,
      operatingIncome: priorIncomeStatement?.operatingIncome ?? null,
      operatingRevenue: priorIncomeStatement?.operatingRevenue ?? null,
      eps: priorEps,
    },
  };
};
