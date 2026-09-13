import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { financialDataAdapter, type IncomeStatementPort, type PaidInSharesPort } from '@/domainPitMetrics/shared/ports/financialDataPorts';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

// 三張季度財報表金額單位是「千元」，流通股數是實際股數，分子要先 x1000 換算成元（跟 eps.ts 一致）。
const toEps = (netIncomeInThousands: bigint | null, shares: bigint | null): number | null => {
  if (netIncomeInThousands === null || shares === null || shares === 0n) return null;
  return Math.round(((Number(netIncomeInThousands) * 1000) / Number(shares)) * 100) / 100;
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface EpsGrowthRatePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

// EPS 成長率（單季年增率）= (本季 EPS - 去年同季 EPS) / |去年同季 EPS| * 100——獨立重新計算
// 本季/去年同季各自的 EPS（不依賴 eps 這個 metric_code 已寫入的值，跟 sgr 對 roe/
// dividendPayoutRatio 的既有做法一致），流通股數各自用當下報告日對應的股本（不是固定用
// 本季股本回推去年，避免股本異動時失真）。只有 Q 一種 basis。
export const computeAndWriteEpsGrowthRatePit = async (query: QuarterlyMetricQuery, statements: IncomeStatementPort & PaidInSharesPort = financialDataAdapter): Promise<EpsGrowthRatePitOutcome> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter =
    query.year !== undefined && query.season !== undefined
      ? { year: query.year, season: query.season }
      : await getLatestAvailableQuarter(symbol, dataType, subsidiaryCompanyId, ['incomeStatement']);

  if (!resolvedQuarter) {
    return { symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' } };
  }

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const key = { symbol, year: rocYear, quarter: seasonNum, dataType, subsidiaryCompanyId };
  const incomeStatement = await statements.getIncomeStatement(key);
  const reportDate = incomeStatement?.reportDate ?? null;
  const currentShares = reportDate ? (await statements.getPaidInShares(symbol, reportDate))?.paidInShares ?? null : null;
  const currentEps = toEps(pickNetIncome(incomeStatement).value, currentShares);

  const prior = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;
  const priorIncomeStatement = await statements.getIncomeStatement({
    symbol,
    year: Number(prior.year),
    quarter: Number(prior.season),
    dataType,
    subsidiaryCompanyId,
  });
  const priorReportDate = priorIncomeStatement?.reportDate ?? null;
  const priorShares = priorReportDate ? (await statements.getPaidInShares(symbol, priorReportDate))?.paidInShares ?? null : null;
  const priorEps = toEps(pickNetIncome(priorIncomeStatement).value, priorShares);

  const growthRate =
    currentEps !== null && priorEps !== null && priorEps !== 0
      ? Math.round(((currentEps - priorEps) / Math.abs(priorEps)) * 100 * 100) / 100
      : null;
  const nullReason: MetricNullReason | null = growthRate !== null ? null : currentEps === null || priorEps === null ? 'missing_input' : 'zero_or_negative_denominator';

  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);
  const coordinateBase = { symbol, metricCode: 'epsGrowthRate', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('Q'),
      value: growthRate,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, q };
};
