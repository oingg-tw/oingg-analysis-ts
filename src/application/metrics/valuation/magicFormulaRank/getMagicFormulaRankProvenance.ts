import { rocYearToGregorian } from '@/domain/calendar/rocQuarter';
import type { QuarterlyMetricQuery } from '@/domain/financials/quarterlyMetric';
import { rankDescending } from '@/domain/metrics/valuation/magicFormulaRank/calculateMagicFormulaRank';
import type { MarketPeriodRow } from '@/application/ports/metricValues';
import type { PitDeps } from '@/application/metrics/deps';
import type { MetricProvenanceResult, ProvenanceEntry } from '../../shared/provenance/provenanceTypes';

// 2026-10-01 使用者要求溯源表全部補齊。magicFormulaRank 不是逐家算得出來的指標——它是 scripts/backfillMagicFormulaRankPit.ts
// 全市場批次排名（greenblattRoc、greenblattEarningsYield 各自由高到低排名後相加），沒有 resolver 可以「現查現算」，
// 所以 value 直接讀寫入的那一列（保證跟徽章／metric-history 一致），兩個分項名次則用同一條排名規則
// （domain 的 rankDescending）在同一個母體上重排出來給讀者看。
//
// 排名母體 = 同一座標有 magicFormulaRank 列的公司——批次只寫「兩項皆非 null、非金融保險業」的公司，寫進去的那批
// 就是當時排名的母體，不用在這裡重做金融業判斷。
// ponytail: 母體用「同座標」近似「同一次批次」——批次讀的是各家最新一季，若某次批次時各家最新季不一致，同一批會
// 散在兩個座標，這裡只會看到其中一個座標的子集；真的發生時改成依 computed_at 的批次時間分組。
//
// 分項名次是用「目前」兩支底層指標的值重排的：底層指標在批次之後若有重算（公式改版），重排的兩個名次相加會跟
// 寫入的合併名次不同——那是寫入值過期、要重跑批次，不是這裡算錯，methodologyNote 會明講。

const toNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const notFound = (symbol: string): MetricProvenanceResult => ({ symbol, metricCode: 'magicFormulaRank', found: false, fiscalYear: null, fiscalQuarter: null, value: null, entries: [], methodologyNote: null });

export const getMagicFormulaRankProvenance = async (query: QuarterlyMetricQuery, deps: Pick<PitDeps, 'metricValues'>): Promise<MetricProvenanceResult> => {
  const { symbol } = query;
  const requested = query.year !== undefined && query.season !== undefined ? { fiscalYear: rocYearToGregorian(Number(query.year)), fiscalQuarter: Number(query.season) } : undefined;

  // 沒指定季別時先找這家公司最新一列的座標，再讀那個座標的完整母體。
  const own = (await deps.metricValues.listPeriodRowsAcrossMarket('magicFormulaRank', 'TTM', requested)).find((row) => row.symbol === symbol);
  const value = toNumber(own?.value);
  if (!own || value === null) return notFound(symbol);

  const coordinate = { fiscalYear: own.fiscalYear, fiscalQuarter: own.fiscalQuarter };
  const [population, rocRows, eyRows] = await Promise.all([
    deps.metricValues.listPeriodRowsAcrossMarket('magicFormulaRank', 'TTM', coordinate),
    deps.metricValues.listPeriodRowsAcrossMarket('greenblattRoc', 'TTM', coordinate),
    deps.metricValues.listPeriodRowsAcrossMarket('greenblattEarningsYield', 'TTM', coordinate),
  ]);

  const valuesBySymbol = (rows: MarketPeriodRow[]) => new Map(rows.map((row) => [row.symbol, toNumber(row.value)]));
  const roc = valuesBySymbol(rocRows);
  const ey = valuesBySymbol(eyRows);
  // 母體依 symbol 排序（port 保證），並列時的先後跟批次一致。
  const rankable = population.map((row) => row.symbol).filter((s) => roc.get(s) != null && ey.get(s) != null);
  const rocRank = rankDescending(rankable.map((s) => [s, roc.get(s)!]));
  const eyRank = rankDescending(rankable.map((s) => [s, ey.get(s)!]));

  const ownRoc = roc.get(symbol) ?? null;
  const ownEy = ey.get(symbol) ?? null;
  const ownRocRank = rocRank.get(symbol) ?? null;
  const ownEyRank = eyRank.get(symbol) ?? null;
  const recomputedSum = ownRocRank !== null && ownEyRank !== null ? ownRocRank + ownEyRank : null;

  const at = { fiscalYear: coordinate.fiscalYear, fiscalQuarter: coordinate.fiscalQuarter, type: 'other' as const, statementType: null, fieldKey: null };
  const entries: ProvenanceEntry[] = [
    { role: '資本報酬率 greenblattRoc（TTM，%）', ...at, sourceDescription: '本服務已算出的 greenblattRoc 指標，見該指標的溯源表', value: ownRoc },
    { role: '資本報酬率全市場名次（數值越高名次越前）', ...at, sourceDescription: `排名母體 ${rankable.length} 家中的名次`, value: ownRocRank },
    { role: '盈餘殖利率 greenblattEarningsYield（TTM，%）', ...at, sourceDescription: '本服務已算出的 greenblattEarningsYield 指標', value: ownEy },
    { role: '盈餘殖利率全市場名次（數值越高名次越前）', ...at, sourceDescription: `排名母體 ${rankable.length} 家中的名次`, value: ownEyRank },
  ];

  const stale =
    recomputedSum === value
      ? ''
      : `注意：兩項底層指標在批次之後有重算，用目前數值重排的兩個名次相加為 ${recomputedSum ?? 'null'}，跟批次寫入的合併名次 ${value} 不同；合併名次要等下一次全市場批次重算才會更新。`;

  return {
    symbol,
    metricCode: 'magicFormulaRank',
    found: true,
    fiscalYear: coordinate.fiscalYear,
    fiscalQuarter: coordinate.fiscalQuarter,
    value,
    entries,
    methodologyNote:
      `神奇公式合併名次 = 資本報酬率名次 + 盈餘殖利率名次（Greenblatt 2005），數字越小代表兩項同時排名越前面。` +
      `排名母體：${coordinate.fiscalYear} 年第 ${coordinate.fiscalQuarter} 季有合併名次的 ${population.length} 家（兩項指標皆非 null、排除金融保險業、無市值門檻），` +
      `全市場批次計算於 ${formatDate(own.computedAt)}。各項名次 = 數值由高到低排序的序位，並列不另做同名次處理。${stale}`,
  };
};
