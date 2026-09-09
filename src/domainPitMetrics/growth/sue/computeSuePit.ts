import { getLatestAvailableQuarter } from '@/shared/sourceData/latestQuarter';
import { getIncomeStatementXbrlFirst as getQuarterlyIncomeStatement } from '@/shared/sourceData/incomeStatementXbrlFirst';
import { getPaidInSharesAsOf } from '@/shared/sourceData/capitalStock';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/shared/rocQuarter';
import type { QuarterlyMetricQuery } from '@/shared/quarterlyMetric';
import { resolveKnowledgeDate } from '../../knowledgeDate';

import { writeMetricValue, type MetricValueWriteOutcome, periodTypeGroup } from '../../metricValueWriter';
import type { MetricNullReason } from '../../metricBasis';

// SUE（標準化未預期盈餘，Standardized Unexpected Earnings）——季節性隨機漫步版
// （Foster, Olsen & Shevlin 1984；Bernard & Thomas 1989），PEAD 文獻旗艦指標。
// UE_i = EPS_i − EPS_{i-4}（本季 vs 去年同季單季 EPS 之差，不是成長率），SUE_t = UE_t /
// σ(UE)，σ 用最近 20 期 UE 的樣本標準差（ddof=1）估計——原始論文用 20 季估計，2026-09-10
// 實測驗證過 2330 的 XBRL 損益表資料至少連續回溯到 108Q3（28 季全部有值，無缺口），資料
// 深度足夠支撐完整的 20 季窗口，不需要退回較短的實務替代窗口。不足 20 期視為
// insufficient_history，不用更少的期數頂替（跟文件「不自訂較短視窗」的原則一致）。

const TARGET_UE_WINDOW = 20;
const MIN_UE_WINDOW = 20;
// 算 20 期 UE 需要「本季往回 20 期」再加上「每期都要比對去年同季」，所以要抓到本季往回
// 20+4-1=23 期前，共 24 期 EPS。
const QUARTERS_OF_EPS_NEEDED = TARGET_UE_WINDOW + 4;

const pickNetIncome = (
  record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null
): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

const toEps = (netIncomeInThousands: bigint | null, shares: bigint | null): number | null => {
  if (netIncomeInThousands === null || shares === null || shares === 0n) return null;
  return (Number(netIncomeInThousands) * 1000) / Number(shares);
};

const sampleStdDev = (values: number[]): number | null => {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface SuePitOutcome {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  q: BasisOutcome;
}

export const computeAndWriteSuePit = async (query: QuarterlyMetricQuery): Promise<SuePitOutcome> => {
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

  // 12 期 EPS，舊到新排列，最後一筆就是本季。
  const epsQuarters = getPastNQuarters({ rocYear, season: season as Season }, QUARTERS_OF_EPS_NEEDED);
  const epsRecords = await Promise.all(
    epsQuarters.map((tq) => getQuarterlyIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const epsValues = await Promise.all(
    epsRecords.map(async (record) => {
      if (!record) return null;
      const netIncome = pickNetIncome(record).value;
      const shares = await getPaidInSharesAsOf(symbol, record.reportDate);
      return toEps(netIncome, shares?.paidInShares ?? null);
    })
  );

  const reportDate = epsRecords[epsRecords.length - 1]?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }]);

  // 索引 QUARTERS_OF_EPS_NEEDED-1 是本季（最新），往前數第 4 筆是去年同季。
  // k=0 是本季 UE，k=1..TARGET_UE_WINDOW-1 是更早的 UE，用來估計標準差（含 k=0 本身）。
  const lastIndex = epsValues.length - 1;
  const ueValues: (number | null)[] = [];
  for (let k = 0; k < TARGET_UE_WINDOW; k++) {
    const currentIdx = lastIndex - k;
    const priorYearIdx = currentIdx - 4;
    if (currentIdx < 0 || priorYearIdx < 0) {
      ueValues.push(null);
      continue;
    }
    const current = epsValues[currentIdx] ?? null;
    const priorYear = epsValues[priorYearIdx] ?? null;
    ueValues.push(current !== null && priorYear !== null ? current - priorYear : null);
  }

  const currentUe = ueValues[0] ?? null;
  const ueWindow = ueValues.filter((v): v is number => v !== null);

  const stdDev = ueWindow.length >= MIN_UE_WINDOW ? sampleStdDev(ueWindow) : null;
  const sueValue = currentUe !== null && stdDev !== null && stdDev !== 0 ? Math.round((currentUe / stdDev) * 100) / 100 : null;

  let nullReason: MetricNullReason | null = null;
  if (sueValue === null) {
    nullReason = currentUe === null || stdDev === null ? 'insufficient_history' : 'zero_or_negative_denominator';
  }

  const coordinateBase = { symbol, metricCode: 'sue', fiscalYear, fiscalQuarter: seasonNum, dataType, subsidiaryCompanyId };

  let q: BasisOutcome;
  if (!mainAnchor) {
    q = { action: 'skipped_no_knowledge_date' };
  } else {
    q = await writeMetricValue({
      ...coordinateBase,
      ...periodTypeGroup('Q'),
      value: sueValue,
      nullReason,
      knowledgeDate: mainAnchor.knowledgeDate,
      knowledgeDateIsFallback: mainAnchor.isFallback,
    });
  }

  return { symbol, rocYear: year, season, q };
};
