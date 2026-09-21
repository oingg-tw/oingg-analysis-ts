import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate, type KnowledgeDateResolution } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { type ComputationBatch, isComputationSkip, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// SUE（標準化未預期盈餘）——2026-09-21 起改採顧廣平（2011）〈盈餘與營收動能〉（管理學報 28(6)，
// 第 525 頁式 (2)，已開 PDF 逐字核對）對台灣市場的定義：
//   SUE_t = (E_t − E_{t−4} − μ) / σ，E 是單季稅後盈餘（金額，不是 EPS），μ、σ 是「前 8 季盈餘變動值
//   E_i − E_{i−4}（i = t−1…t−8）」的平均數與樣本標準差（有漂移項的季節性隨機漫步）。
// 取代原本 2026-09-10 的 Bernard & Thomas 版（EPS、無漂移項、σ 取最近 20 期 UE）。改的理由不是
// 「縮短視窗」而是換出處：舊版需要 24 季 EPS（含流通股數），2026-09-21 實測全市場最新一季只有
// 2330 一家算得出來（2057 家 insufficient_history，還卡股本資料缺口）；顧 2011 的版本只要 13 季淨利、
// 不需要股本，全市場都算得出來，而且它本身就是一篇原創、台灣樣本、免費全文的出處（也是徽章的出處）。
// formulaVersion 2——同座標舊值會被重算覆蓋（updated_same_knowledge_date），這是刻意的公式變更。
//
// 資料規則：13 季淨利任一缺漏 → insufficient_history（不用更少期數頂替，窗口變短 σ 就失真）；
// σ = 0 → zero_or_negative_denominator。resolveSueInputs 仍回傳逐季明細給 getSueProvenance.ts 共用。

export const SUE_FORMULA_VERSION = 2;
// 前 8 季盈餘變動值 + 每個變動值要往前 4 季比對 + 本季 = 8 + 4 + 1 = 13 季淨利。
const DRIFT_WINDOW = 8;
const QUARTERS_OF_EARNINGS_NEEDED = DRIFT_WINDOW + 4 + 1;

const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

const sampleStdDev = (values: number[]): number | null => {
  if (values.length < 2) return null;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
};

export interface SueQuarterDetail {
  rocYear: number;
  season: number;
  fiscalYear: number;
  netIncome: PickedField;
}

export interface SueResolution {
  symbol: string;
  rocYear: string;
  season: string;
  fiscalYear: number;
  fiscalQuarter: number;
  quarterDetails: SueQuarterDetail[]; // 13 季，舊到新，最後一筆是本季
  lastIndex: number;
  currentChange: number | null; // E_t − E_{t−4}
  drift: number | null; // μ
  stdDev: number | null; // σ
  sueValue: number | null;
  nullReason: MetricNullReason | null;
  mainAnchor: KnowledgeDateResolution | null;
}

export const resolveSueInputs = async (query: QuarterlyMetricQuery, deps: SueDeps): Promise<SueResolution | null> => {
  const { symbol, dataType, subsidiaryCompanyId } = query;

  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);

  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);
  const seasonNum = Number(season);
  const fiscalYear = rocYearToGregorian(rocYear);

  const quarters = getPastNQuarters({ rocYear, season: season as Season }, QUARTERS_OF_EARNINGS_NEEDED);
  const records = await Promise.all(
    quarters.map((tq) => deps.statements.getIncomeStatement({ symbol, year: Number(tq.year), quarter: Number(tq.season), dataType, subsidiaryCompanyId }))
  );
  const quarterDetails: SueQuarterDetail[] = quarters.map((tq, i) => ({
    rocYear: Number(tq.year),
    season: Number(tq.season),
    fiscalYear: rocYearToGregorian(Number(tq.year)),
    netIncome: pickNetIncome(records[i]!),
  }));

  const reportDate = records[records.length - 1]?.reportDate ?? null;
  const mainAnchor = await resolveKnowledgeDate(symbol, [{ rocYear, season: seasonNum, reportDate }], deps.announcements);

  const lastIndex = quarterDetails.length - 1;
  // k=0 是本季的盈餘變動值，k=1..8 是前 8 季的盈餘變動值（估 μ、σ 用）。
  const changeAt = (k: number): number | null => {
    const current = quarterDetails[lastIndex - k]!.netIncome.value;
    const priorYear = quarterDetails[lastIndex - k - 4]!.netIncome.value;
    return current !== null && priorYear !== null ? Number(current - priorYear) : null;
  };
  const currentChange = changeAt(0);
  const driftWindow = Array.from({ length: DRIFT_WINDOW }, (_, i) => changeAt(i + 1));
  const historyComplete = currentChange !== null && driftWindow.every((v) => v !== null);

  const drift = historyComplete ? mean(driftWindow as number[]) : null;
  const stdDev = historyComplete ? sampleStdDev(driftWindow as number[]) : null;
  const sueValue = currentChange !== null && drift !== null && stdDev !== null && stdDev !== 0 ? Math.round(((currentChange - drift) / stdDev) * 100) / 100 : null;

  const nullReason: MetricNullReason | null = sueValue !== null ? null : !historyComplete ? 'insufficient_history' : 'zero_or_negative_denominator';

  return { symbol, rocYear: year, season, fiscalYear, fiscalQuarter: seasonNum, quarterDetails, lastIndex, currentChange, drift, stdDev, sueValue, nullReason, mainAnchor };
};

export type SueDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;

export type SueComputationBatch = ComputationBatch<'q'>;

export const computeSue = async (query: QuarterlyMetricQuery, deps: SueDeps): Promise<SueComputationBatch> => {
  const resolution = await resolveSueInputs(query, deps);
  if (!resolution) {
    return noQuarterBatch(query.symbol, ['q']);
  }

  const { symbol, rocYear, season, fiscalYear, fiscalQuarter, sueValue, nullReason, mainAnchor } = resolution;
  const coordinateBase = { symbol, metricCode: 'sue', fiscalYear, fiscalQuarter, dataType: query.dataType, subsidiaryCompanyId: query.subsidiaryCompanyId };

  const slot = periodSlot(mainAnchor, coordinateBase, 'Q', sueValue, nullReason);
  const q = isComputationSkip(slot) ? slot : { ...slot, formulaVersion: SUE_FORMULA_VERSION };

  return { symbol, rocYear, season, slots: { q } };
};
