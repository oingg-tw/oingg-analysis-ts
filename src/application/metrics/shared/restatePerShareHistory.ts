import type { AppDeps } from '@/application/deps';
import { metricDefinitionRegistry } from '@/application/metrics/metricDefinitionRegistry';
import type { PeriodType } from '@/domain/metrics/metricBasis';

// 2026-09-28 每股歷史數字換算到今天的股數基準（使用者：「股價照下單軟體、每股數字反映內在價值」——「只是股數變了、公司價值沒變」的
// 分割、配股、股數合併式減資換算掉，IAS 33 追溯調整前期每股數字的做法；現金股利、退還股款是真的有錢流出，不換算）。
// 例：5904 2026-06 面額 10→1，換算前每股淨值走勢在 2026Q2 掉成十分之一、公司價值根本沒變。
// - 各期存的值是「當期」的股數基準（季末股本歷史）；年報來源的 FY（eps、損益表每股科目，annualReportSlot）已經是年報公布時的基準
//   （IAS 33.64：期後、財報發布前的分割要重編——7780 2025 年報 EPS 0.51 就是分割後），從公告日起算。
// - 倍數＝基準日到今天登記的事件（getShareSplitFactor）× 今天市場上已換、股本歷史還沒登記的（getShareBasisEvents 的 basisMultiplier，
//   例如 6669 2026-09-02 除權、登記還沒出來）。
// 只在對外的歷史端點換算；資料庫存的值不動，股利歷史（盈餘發放率要跟公告的每股股利同一基準）、最新值查詢照原值。
export type RestatePerShareDeps = Pick<AppDeps, 'shares'>;

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
      const basisDate = periodType === 'FY' ? annualBasis : new Date(Date.UTC(e.fiscalYear, (e.fiscalQuarter ?? 4) * 3, 0));
      const factor = (await deps.shares.getShareSplitFactor(symbol, basisDate, now)) * basisMultiplier;
      return Math.abs(factor - 1) < 1e-9 ? e : { ...e, value: Math.round((e.value / factor) * 100) / 100 };
    })
  );
};
