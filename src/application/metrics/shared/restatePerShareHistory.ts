import type { AppDeps } from '@/application/deps';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import type { PeriodType } from '@/domain/metrics/metricBasis';
import { toProvenanceEntryValue, type MetricProvenanceResult } from '@/application/metrics/shared/provenance/provenanceTypes';

// 2026-09-28 每股歷史數字換算到今天的股數基準（使用者：「股價照下單軟體、每股數字反映內在價值」——「只是股數變了、公司價值沒變」的
// 分割、配股、股數合併式減資換算掉，IAS 33 追溯調整前期每股數字的做法；現金股利、退還股款是真的有錢流出，不換算）。
// 例：5904 2026-06 面額 10→1，換算前每股淨值走勢在 2026Q2 掉成十分之一、公司價值根本沒變。
// - 各期存的值是「當期」的股數基準（季末股本歷史）；年報來源的 FY（eps、損益表每股科目，annualReportSlot）已經是年報公布時的基準
//   （IAS 33.64：期後、財報發布前的分割要重編——7780 2025 年報 EPS 0.51 就是分割後），從公告日起算。
// - 倍數＝基準日到今天登記的事件（getShareSplitFactor）× 今天市場上已換、股本歷史還沒登記的（getShareBasisEvents 的 basisMultiplier，
//   例如 6669 2026-09-02 除權、登記還沒出來）。
// 只在對外的歷史端點換算；資料庫存的值不動，股利歷史（盈餘發放率要跟公告的每股股利同一基準）、最新值查詢照原值。
export type RestatePerShareDeps = Pick<AppDeps, 'shares'>;

// 基準日到今天的換算倍數；溯源表（restatePerShareProvenance）跟歷史端點共用同一支，兩邊顯示的數字才會一樣。
const restatementFactor = async (symbol: string, basisDate: Date, now: Date, basisMultiplier: number, deps: RestatePerShareDeps): Promise<number> =>
  (await deps.shares.getShareSplitFactor(symbol, basisDate, now)) * basisMultiplier;
const isIdentity = (factor: number): boolean => Math.abs(factor - 1) < 1e-9;
const restate = (value: number, factor: number): number => Math.round((value / factor) * 100) / 100;
const quarterEnd = (fiscalYear: number, fiscalQuarter: number | null): Date => new Date(Date.UTC(fiscalYear, (fiscalQuarter ?? 4) * 3, 0));

interface RestatableEntry {
  fiscalYear: number;
  fiscalQuarter: number | null;
  knowledgeDate: string;
  knowledgeDateIsFallback: boolean;
  value: number | null;
}

export const restatePerShareHistory = async <E extends RestatableEntry>(
  symbol: string,
  metricCode: string,
  periodType: PeriodType,
  entries: E[],
  deps: RestatePerShareDeps
): Promise<E[]> => {
  if (!metricDefinitionRegistry[metricCode]?.perShare || entries.every((e) => e.value === null)) return entries;
  const now = new Date();
  const { basisMultiplier } = await deps.shares.getShareBasisEvents(symbol, now, now);
  return Promise.all(
    entries.map(async (e) => {
      if (e.value === null) return e;
      // 年報公告日查無（knowledgeDate 是期末頂替）時用法定期限：隔年 3/31（7780 的兩個 FY 都是頂替，照期末算會重複換算成 0.05）。
      const annualBasis = e.knowledgeDateIsFallback ? new Date(Date.UTC(e.fiscalYear + 1, 2, 31)) : new Date(e.knowledgeDate);
      const basisDate = periodType === 'FY' ? annualBasis : quarterEnd(e.fiscalYear, e.fiscalQuarter);
      const factor = await restatementFactor(symbol, basisDate, now, basisMultiplier, deps);
      return isIdentity(factor) ? e : { ...e, value: restate(e.value, factor) };
    })
  );
};

// 2026-10-01 溯源表（GET /companies/:symbol/metric-provenance）的 value 也換算到今天的股數基準：metricProvenanceResultSchema.value 的
// 契約是「跟 badge／metric-history 顯示的數字一致」，web-nuxt 實測 1235（季末後配股約 5%）六支每股指標溯源 ÷ 歷史端點都是同一個
// 常數倍數、2887 約 1%——不是公式錯，是歷史端點有換算、溯源表沒有。這裡用跟 restatePerShareHistory 同一支倍數換算（溯源表的
// 期間都是 Q／TTM，基準日＝季末），原本「當期股數基準」的值（＝資料庫寫入的值）跟倍數各列一筆 type 'other'，看得出怎麼換算的。
export const restatePerShareProvenance = async (result: MetricProvenanceResult, deps: RestatePerShareDeps): Promise<MetricProvenanceResult> => {
  if (!metricDefinitionRegistry[result.metricCode]?.perShare || typeof result.value !== 'number' || result.fiscalYear === null) return result;
  const now = new Date();
  const { basisMultiplier } = await deps.shares.getShareBasisEvents(result.symbol, now, now);
  const factor = await restatementFactor(result.symbol, quarterEnd(result.fiscalYear, result.fiscalQuarter), now, basisMultiplier, deps);
  if (isIdentity(factor)) return result;
  const at = { fiscalYear: result.fiscalYear, fiscalQuarter: result.fiscalQuarter, type: 'other' as const, statementType: null, fieldKey: null };
  return {
    ...result,
    value: restate(result.value, factor),
    entries: [
      ...result.entries,
      { role: '當期股數基準的計算值（季末股本；資料庫寫入的就是這個值）', ...at, sourceDescription: '由上方各列計算', value: result.value },
      {
        role: '換算到今天股數基準的倍數（季末以後的分割／配股／股數合併式減資；溯源值 = 當期基準值 ÷ 這個倍數，跟 metric-history 顯示的一致）',
        ...at,
        sourceDescription: '公開發行公司股本變動申報（面額變更、股票股利、減資）＋今天市場上已除權、股本尚未登記的事件',
        value: toProvenanceEntryValue(factor),
      },
    ],
  };
};
