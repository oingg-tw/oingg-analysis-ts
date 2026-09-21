import { resolveQuarterOrLatest } from '@/application/financials/latestQuarter';
import { getPastNQuarters, rocYearToGregorian, type Season } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import type { MetricNullReason } from '@/domain/metrics/metricBasis';
import { periodTypeGroup } from '@/domain/metrics/coordinate';
import { computation, isComputationSkip, noQuarterBatch, type ComputationBatch, type MetricComputation } from '@/domain/metrics/computation';
import type { PitDeps } from '@/application/metrics/deps';
import { computeMarginsFamily } from '@/application/metrics/profitability/margins/computeMarginsFamily';
import { computeDupontFamily } from '@/application/metrics/shared/dupont/computeDupontFamily';

// 「三率三升」（毛利率/營業利益率/稅後淨利率同步上升）——複合指標，在程序內直接呼叫既有三率的
// compute 拿 Q slot（不重寫任何一條公式，三率的公式改了這裡自動跟著改），分別對「本季」「上一季」
// 「去年同季」各呼叫一次。跟 oneilCanslimScore 同一種「複合指標不讀 metric_values、程序內直接算」
// 的設計，理由同樣是全市場回填 Promise.allSettled 平行跑、讀庫會跟同批次寫入競賽。
//
// 門檻/出處見 threeMarginsRisingBadge.ts——這是「單一可指名出處」標準唯一的例外，使用者明確
// 要求放行，不是查證疏漏。

export type ThreeMarginsRisingDeps = Pick<PitDeps, 'statements' | 'quarters' | 'announcements'>;
export type ThreeMarginsRisingComputationBatch = ComputationBatch<'q'>;

interface MarginTriple {
  gross: MetricComputation;
  operating: MetricComputation;
  net: MetricComputation;
}

// 某個座標（本季/上一季/去年同季）的三率 Q 值——任一率的座標本身解析不出來（skip，例如那一季
// 完全查無資料）就回傳 null，呼叫端視為「這個比較基準拿不到」。
const getMarginsAt = async (query: QuarterlyMetricQuery, year: string, season: Season, deps: ThreeMarginsRisingDeps): Promise<MarginTriple | null> => {
  const pinned: QuarterlyMetricQuery = { ...query, year, season };
  const [margins, dupont] = await Promise.all([computeMarginsFamily(pinned, deps), computeDupontFamily(pinned, deps)]);
  const { grossMarginQ: gross, operatingMarginQ: operating } = margins.slots;
  const { netProfitMarginQ: net } = dupont.slots;
  if (isComputationSkip(gross) || isComputationSkip(operating) || isComputationSkip(net)) return null;
  return { gross: gross as MetricComputation, operating: operating as MetricComputation, net: net as MetricComputation };
};

// 「本季 > 上一季」且「本季 > 去年同季」（雙重驗證）才算「升」；任一邊持平或下滑都不算，
// 任一數值缺漏回傳 null（無法判斷，不是「沒升」）。
const risingBoth = (current: MetricComputation, qoqBase: MetricComputation, yoyBase: MetricComputation): boolean | null => {
  if (current.value === null || qoqBase.value === null || yoyBase.value === null) return null;
  return current.value > qoqBase.value && current.value > yoyBase.value;
};

// 2026-09-21：抽出 resolveThreeMarginsRisingInputs()——三個座標的三率明細與判定結果，給
// getThreeMarginsRisingProvenance.ts（GET /companies/:symbol/metric-provenance）共用，寫入路徑本身
// 行為不變。
export interface ThreeMarginsRisingResolution {
  year: string;
  season: Season;
  qoqCoord: { year: string; season: Season };
  yoyCoord: { year: string; season: Season };
  current: MarginTriple;
  qoqBase: MarginTriple | null;
  yoyBase: MarginTriple | null;
  signals: Record<'grossMargin' | 'operatingMargin' | 'netProfitMargin', boolean | null>;
  score: number | null;
  nullReason: MetricNullReason | null;
}

export const resolveThreeMarginsRisingInputs = async (
  query: QuarterlyMetricQuery,
  deps: ThreeMarginsRisingDeps
): Promise<{ year: string; season: string; resolution: ThreeMarginsRisingResolution | null } | null> => {
  const resolvedQuarter = await resolveQuarterOrLatest(query, ['incomeStatement'], deps.quarters);
  if (!resolvedQuarter) return null;

  const { year, season } = resolvedQuarter;
  const rocYear = Number(year);

  const qoqCoord = getPastNQuarters({ rocYear, season: season as Season }, 2)[0]!;
  const yoyCoord = getPastNQuarters({ rocYear, season: season as Season }, 5)[0]!;

  const [current, qoqBase, yoyBase] = await Promise.all([
    getMarginsAt(query, year, season as Season, deps),
    getMarginsAt(query, qoqCoord.year, qoqCoord.season, deps),
    getMarginsAt(query, yoyCoord.year, yoyCoord.season, deps),
  ]);

  if (!current) return { year, season, resolution: null };

  const evaluate = (metric: 'gross' | 'operating' | 'net'): boolean | null => {
    if (!qoqBase || !yoyBase) return null;
    return risingBoth(current[metric], qoqBase[metric], yoyBase[metric]);
  };

  const signals = { grossMargin: evaluate('gross'), operatingMargin: evaluate('operating'), netProfitMargin: evaluate('net') };
  const signalValues = Object.values(signals);
  const allEvaluated = signalValues.every((s) => s !== null);
  const score = allEvaluated ? signalValues.reduce((sum: number, s) => sum + (s ? 1 : 0), 0) : null;

  // 拿不到比較基準（上一季/去年同季那個座標本身是 skip）優先歸因 insufficient_history——
  // 對使用者最有解釋力（通常是上市未滿一年或該季資料還沒回填），其餘情況（基準座標都在，
  // 只是某一率的值本身是 null）歸 missing_input。
  const nullReason: MetricNullReason | null = score === null ? (!qoqBase || !yoyBase ? 'insufficient_history' : 'missing_input') : null;

  return { year, season, resolution: { year, season: season as Season, qoqCoord, yoyCoord, current, qoqBase, yoyBase, signals, score, nullReason } };
};

export const computeThreeMarginsRising = async (query: QuarterlyMetricQuery, deps: ThreeMarginsRisingDeps): Promise<ThreeMarginsRisingComputationBatch> => {
  const resolved = await resolveThreeMarginsRisingInputs(query, deps);
  if (!resolved) return noQuarterBatch(query.symbol, ['q']);
  const { year, season, resolution } = resolved;

  // 本季自己連三率的座標都解析不出來（少見，通常代表這季 knowledge date 沒著落）——整支 skip，
  // 理由沿用「沒有 knowledge date」，跟三率本身遇到這個情境的行為一致。
  if (!resolution) {
    return { symbol: query.symbol, rocYear: year, season, slots: { q: { action: 'skipped_no_knowledge_date' } } };
  }
  const { current, score, nullReason } = resolution;
  const rocYear = Number(year);
  const seasonNum = Number(season);

  const knowledgeDateSources: MetricComputation[] = [current.gross, current.operating, current.net];
  const knowledgeDate = new Date(Math.max(...knowledgeDateSources.map((s) => s.knowledgeDate.getTime())));
  const knowledgeDateIsFallback = knowledgeDateSources.some((s) => s.knowledgeDateIsFallback);

  const q = computation({
    symbol: query.symbol,
    metricCode: 'threeMarginsRising',
    fiscalYear: rocYearToGregorian(rocYear),
    fiscalQuarter: seasonNum,
    dataType: query.dataType,
    subsidiaryCompanyId: query.subsidiaryCompanyId,
    ...periodTypeGroup('Q'),
    value: score,
    nullReason,
    knowledgeDate,
    knowledgeDateIsFallback,
  });

  return { symbol: query.symbol, rocYear: year, season, slots: { q } };
};
