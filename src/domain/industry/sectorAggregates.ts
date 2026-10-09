import { round2 } from '@/domain/metrics/shared/numericHelpers';

// 2026-10-09 web-nuxt 產業分析的三支類股端點（使用者核准）共用的純彙總：
// - GET /industries/{sectorCode}/metric-history：每一期各自算類股四分位（每期只用那一期的值，不混期）。
// - GET /industries/{sectorCode}/monthly-revenue-history：同一批公司口徑的類股月營收年增率。
// - GET /industries/sector-summary：每家最新一筆的類股四分位（混期快照，形狀比照 sector-dividend-summary）。
// 合規上 web-nuxt 只畫類股中位數與「單一個股 vs 類股中位數」，所以這裡只給分布統計，不給成員明細或排行。

export interface QuartileSummary {
  count: number;
  median: number | null;
  q1: number | null;
  q3: number | null;
}

// 分位數用線性內插，跟 Postgres percentile_cont 同一個定義（screener distribution 的 p20/p40… 也是 percentile_cont），
// 偶數家的中位數＝中間兩家平均。
const percentile = (sorted: number[], p: number): number => {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
};

export const summarizeQuartiles = (values: number[]): QuartileSummary => {
  if (values.length === 0) return { count: 0, median: null, q1: null, q3: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, median: round2(percentile(sorted, 0.5)), q1: round2(percentile(sorted, 0.25)), q3: round2(percentile(sorted, 0.75)) };
};

export interface SectorPeriodValue {
  fiscalYear: number;
  fiscalQuarter: number;
  value: number | null;
  nullReason: string | null;
}

export interface SectorPeriodSummary extends QuartileSummary {
  fiscalYear: number;
  fiscalQuarter: number;
  nullReason: string | null;
}

// 逐期分組（呼叫端已經每家每期只給一列）。count 0 的期別 nullReason 取那一期最多公司的原因
// （金融保險類股的不適用指標就是 not_applicable_industry），有值的期別 nullReason 是 null。由舊到新。
export const summarizeSectorPeriods = (rows: SectorPeriodValue[]): SectorPeriodSummary[] => {
  const groups = new Map<number, SectorPeriodValue[]>();
  for (const r of rows) {
    const key = r.fiscalYear * 10 + r.fiscalQuarter;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, g]) => {
      const summary = summarizeQuartiles(g.flatMap((r) => (r.value === null ? [] : [r.value])));
      const reasons = new Map<string, number>();
      for (const r of g) if (r.nullReason !== null) reasons.set(r.nullReason, (reasons.get(r.nullReason) ?? 0) + 1);
      const topReason = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return { fiscalYear: g[0]!.fiscalYear, fiscalQuarter: g[0]!.fiscalQuarter, ...summary, nullReason: summary.count === 0 ? topReason : null };
    });
};

export interface CompanyMonthlyRevenue {
  symbol: string;
  yearMonth: string; // "YYYY-MM"
  revenue: bigint | null; // 千元
  lastYearRevenue: bigint | null; // 同一份申報裡的去年同月營收（千元）
}

export interface SectorMonthlyRevenue {
  yearMonth: string;
  revenue: string; // 千元，bigint 序列化成字串（同個股月營收）
  lastYearRevenue: string;
  yoyChangePercent: number | null;
  companyCount: number;
}

// 同一批公司口徑（web-nuxt 要求，避免新上市／下市讓年增率跳動）：只加「當月有營收、去年同月營收 > 0」的公司，
// revenue 與 lastYearRevenue 都只算這一批，companyCount 是這一批的家數。去年同月 0 視為不可比（來源的
// yoy_change_percent 對這種列也是 null）。去年同月用申報裡自帶的欄位，不是自己去年那一列，兩者就是同一家公司。
// 由舊到新；一家都不可比的月份不出現。
export const summarizeSectorMonthlyRevenue = (rows: CompanyMonthlyRevenue[]): SectorMonthlyRevenue[] => {
  const months = new Map<string, { revenue: bigint; lastYearRevenue: bigint; companyCount: number }>();
  for (const r of rows) {
    if (r.revenue === null || r.lastYearRevenue === null || r.lastYearRevenue <= 0n) continue;
    const m = months.get(r.yearMonth) ?? { revenue: 0n, lastYearRevenue: 0n, companyCount: 0 };
    months.set(r.yearMonth, { revenue: m.revenue + r.revenue, lastYearRevenue: m.lastYearRevenue + r.lastYearRevenue, companyCount: m.companyCount + 1 });
  }
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([yearMonth, m]) => ({
      yearMonth,
      revenue: m.revenue.toString(),
      lastYearRevenue: m.lastYearRevenue.toString(),
      yoyChangePercent: round2((Number(m.revenue - m.lastYearRevenue) / Number(m.lastYearRevenue)) * 100),
      companyCount: m.companyCount,
    }));
};
