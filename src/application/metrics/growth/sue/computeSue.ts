import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate, type KnowledgeDateResolution } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { type ComputationBatch, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// SUE（標準化未預期盈餘，Standardized Unexpected Earnings）——季節性隨機漫步版
// （Foster, Olsen & Shevlin 1984；Bernard & Thomas 1989），PEAD 文獻旗艦指標。
// UE_i = EPS_i − EPS_{i-4}（本季 vs 去年同季單季 EPS 之差，不是成長率），SUE_t = UE_t /
// σ(UE)，σ 用最近 20 期 UE 的樣本標準差（ddof=1）估計——原始論文用 20 季估計，2026-09-10
// 實測驗證過 2330 的 XBRL 損益表資料至少連續回溯到 108Q3（28 季全部有值，無缺口），資料
// 深度足夠支撐完整的 20 季窗口，不需要退回較短的實務替代窗口。不足 20 期視為
// insufficient_history，不用更少的期數頂替（跟文件「不自訂較短視窗」的原則一致）。
//
// 2026-09-10：抽出 resolveSueInputs()，回傳完整 24 期的逐季明細（原本算完 EPS 就丟掉
// netIncome/shares 細節），給 getSueProvenance.ts（GET /companies/:symbol/metric-provenance
// 的 sue 試點）共用；寫入路徑（computeAndWriteSuePit）本身行為不變，只是內部改呼叫這個
// resolver。

const TARGET_UE_WINDOW = 20;
const MIN_UE_WINDOW = 20;
// 算 20 期 UE 需要「本季往回 20 期」再加上「每期都要比對去年同季」，所以要抓到本季往回
// 20+4-1=23 期前，共 24 期 EPS。
const QUARTERS_OF_EPS_NEEDED = TARGET_UE_WINDOW + 4;

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

export interface SueQuarterDetail {
  rocYear: number;
  season: number;
  fiscalYear: number;
  netIncome: PickedField;
  shares: bigint | null;
  eps: number | null;
}

export interface SueResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  quarterDetails: SueQuarterDetail[];
  lastIndex: number;
  ueValues: (number | null)[];
  currentUe: number | null;
  stdDev: number | null;
  sueValue: number | null;
  nullReason: MetricNullReason | null;
  mainAnchor: KnowledgeDateResolution | null;
}

export const resolveSueInputs = async (
  query: QuarterlyMetricQuery,
  deps: SueDeps
): Promise<SueResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  // 24 期 EPS，舊到新排列，最後一筆就是本季。
  const epsQuarters = getPastNQuarters({ rocYear, season: season as Season }, QUARTERS_OF_EPS_NEEDED);
  const epsRecords = await Promise.all(
    epsQuarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const quarterDetails: SueQuarterDetail[] = await Promise.all(
    epsQuarters.map(async (tq, i) => {
      const record = epsRecords[i]!;
      const netIncome = pickNetIncome(record);
      const shares = record ? (await deps.shares.getPaidInShares(symbol, record.reportDate))?.paidInShares ?? null : null;
      return {
        rocYear: Number(tq.year),
        season: Number(tq.season),
        fiscalYear: rocYearToGregorian(Number(tq.year)),
        netIncome,
        shares,
        eps: toEps(netIncome.value, shares),
      };
    })
  );

  const reportDate = epsRecords[epsRecords.length - 1]?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  // 索引 QUARTERS_OF_EPS_NEEDED-1 是本季（最新），往前數第 4 筆是去年同季。
  // k=0 是本季 UE，k=1..TARGET_UE_WINDOW-1 是更早的 UE，用來估計標準差（含 k=0 本身）。
  const lastIndex = quarterDetails.length - 1;
  const ueValues: (number | null)[] = [];
  for (let k = 0; k < TARGET_UE_WINDOW; k++) {
    const currentIdx = lastIndex - k;
    const priorYearIdx = currentIdx - 4;
    if (currentIdx < 0 || priorYearIdx < 0) {
      ueValues.push(null);
      continue;
    }
    const current = quarterDetails[currentIdx]!.eps;
    const priorYear = quarterDetails[priorYearIdx]!.eps;
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

  return { symbol, rocYear: year, season, fiscalYear, fiscalQuarter: seasonNum, quarterDetails, lastIndex, ueValues, currentUe, stdDev, sueValue, nullReason, mainAnchor };
};


export type SueDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements' | 'shares'>;

export type SueComputationBatch = ComputationBatch<'q'>;

export const computeSue = async (
  query: QuarterlyMetricQuery,
  deps: SueDeps
): Promise<SueComputationBatch> => {
  const resolution = await resolveSueInputs(query, deps);
  if (!resolution) {
    return noQuarterBatch(query.symbol, ['q']);
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, sueValue, nullReason, mainAnchor } = resolution;
  const coordinateBase = { symbol, metricCode: 'sue', fiscalYear, fiscalQuarter, dataType: query.dataType, subsidiaryCompanyId: query.subsidiaryCompanyId };

  const q = periodSlot(mainAnchor, coordinateBase, 'Q', sueValue, nullReason);

  return { symbol, rocYear, season, slots: { q } };
};
