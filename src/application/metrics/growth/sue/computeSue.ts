import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { pickNetIncomeWithFieldKey as pickNetIncome, type PickedField } from '@/domain/metrics/shared/pickers';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { resolveKnowledgeDate, type KnowledgeDateResolution } from '../../knowledgeDate';
import type { MetricNullReason } from '../../../../domain/metrics/metricBasis';
import { type ComputationBatch, isComputationSkip, noQuarterBatch, periodSlot } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';

// SUE（標準化未預期盈餘）——2026-09-22 起照 Chan, Jegadeesh & Lakonishok（1996）《Momentum Strategies》
// （Journal of Finance 51(5)，第 1685 頁，Wharton 公開鏡像 PDF 已逐字核對）的定義：
//   SUE_t = (E_t − E_{t−4}) / σ，σ 是「前 8 季盈餘變動值 E_i − E_{i−4}（i = t−1…t−8）」的標準差
//   （原文：「the standard deviation of unexpected earnings, e_iq − e_iq−4, over the preceding eight quarters」，
//   無漂移項的季節性隨機漫步，作者引 Foster, Olsen & Shevlin 1984 說明這個模型不輸更複雜的模型）。
//   Novy-Marx（2015）《Fundamentally, Momentum is Fundamental Momentum》用一模一樣的定義。
// 版本史：v1（2026-09-10）Bernard & Thomas 1989 的 EPS 版，σ 取 20 期，全市場只有 2330 算得出來；
// v2（2026-09-21）顧廣平 2011 版（多一個漂移項 μ、σ 取前 8 季），13 季即可；v3（2026-09-22）拿掉 μ 對齊
// CJL 1996——使用者認為三支成長動能徽章都掛顧廣平太刻意，SUE 換成國際原始出處，13 季需求不變。
// 跟 CJL 的已知落差：原文 e 是 EPS，這裡用單季淨利金額（股本資料缺口，見 v1 的教訓）——股數沒有大幅
// 變動時兩者的 SUE 相同；標準差用樣本標準差（ddof=1），原文沒有明講。
// formulaVersion 3——同座標舊值會被重算覆蓋（updated_same_knowledge_date），這是刻意的公式變更。
//
// 資料規則：13 季淨利任一缺漏 → insufficient_history（不用更少期數頂替，窗口變短 σ 就失真）；
// σ = 0 → zero_or_negative_denominator。resolveSueInputs 仍回傳逐季明細給 getSueProvenance.ts 共用。

export const SUE_FORMULA_VERSION = 3;
// 前 8 季盈餘變動值 + 每個變動值要往前 4 季比對 + 本季 = 8 + 4 + 1 = 13 季淨利。
const SIGMA_WINDOW = 8;
const QUARTERS_OF_EARNINGS_NEEDED = SIGMA_WINDOW + 4 + 1;

const sampleStdDev = (values: number[]): number | null => {
  if (values.length < 2) return null;
  const m = values.reduce((sum, v) => sum + v, 0) / values.length;
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
  // k=0 是本季的盈餘變動值，k=1..8 是前 8 季的盈餘變動值（估 σ 用）。
  const changeAt = (k: number): number | null => {
    const current = quarterDetails[lastIndex - k]!.netIncome.value;
    const priorYear = quarterDetails[lastIndex - k - 4]!.netIncome.value;
    return current !== null && priorYear !== null ? Number(current - priorYear) : null;
  };
  const currentChange = changeAt(0);
  const sigmaWindow = Array.from({ length: SIGMA_WINDOW }, (_, i) => changeAt(i + 1));
  const historyComplete = currentChange !== null && sigmaWindow.every((v) => v !== null);

  const stdDev = historyComplete ? sampleStdDev(sigmaWindow as number[]) : null;
  const sueValue = currentChange !== null && stdDev !== null && stdDev !== 0 ? Math.round((currentChange / stdDev) * 100) / 100 : null;

  const nullReason: MetricNullReason | null = sueValue !== null ? null : !historyComplete ? 'insufficient_history' : 'zero_or_negative_denominator';

  return { symbol, rocYear: year, season, fiscalYear, fiscalQuarter: seasonNum, quarterDetails, lastIndex, currentChange, stdDev, sueValue, nullReason, mainAnchor };
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
