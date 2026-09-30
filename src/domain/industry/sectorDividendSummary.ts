import { round2 } from '@/domain/metrics/shared/numericHelpers';

// 2026-09-30 使用者設計「產業分析圖表」：每個證交所類股一個點，Y 軸殖利率、X 軸股利 3 年成長率。
// 這裡是純彙總——每家公司各自最新一筆值（呼叫端查好）按類股分組，平均數與中位數兩個都給：
// 使用者指定 Y 軸用「平均」，但成長率這種有極端值的分布（基期很小的公司 CAGR 可以上百 %）平均數會被
// 一兩家拉走，中位數比較能代表類股，所以兩種都算，前端依軸挑，不用再來回改 API。
// null 一律不計入 count（成長率 null = 基期沒配息或歷史不足）。殖利率 0 要不要算進去由呼叫端決定——
// 見 application/industries/service.ts 為什麼現在先排除。
export interface SectorCompanyValues {
  sectorCode: string;
  sectorName: string;
  dividendYield: number | null;
  dividendGrowthRate3y: number | null;
}

export interface AxisSummary {
  count: number; // 這一軸有值的公司數，跟 companyCount 不同——樣本太少的類股前端要自己判斷怎麼呈現
  mean: number | null;
  median: number | null;
}

export interface SectorDividendSummary {
  sectorCode: string;
  sectorName: string;
  companyCount: number;
  dividendYield: AxisSummary;
  dividendGrowthRate3y: AxisSummary;
}

const summarize = (values: number[]): AxisSummary => {
  if (values.length === 0) return { count: 0, mean: null, median: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return { count: values.length, mean: round2(values.reduce((s, v) => s + v, 0) / values.length), median: round2(median) };
};

export const summarizeSectorDividends = (rows: SectorCompanyValues[]): SectorDividendSummary[] => {
  const groups = new Map<string, SectorCompanyValues[]>();
  for (const r of rows) groups.set(r.sectorCode, [...(groups.get(r.sectorCode) ?? []), r]);
  return [...groups.values()]
    .map((g) => ({
      sectorCode: g[0]!.sectorCode,
      sectorName: g[0]!.sectorName,
      companyCount: g.length,
      dividendYield: summarize(g.flatMap((r) => (r.dividendYield === null ? [] : [r.dividendYield]))),
      dividendGrowthRate3y: summarize(g.flatMap((r) => (r.dividendGrowthRate3y === null ? [] : [r.dividendGrowthRate3y]))),
    }))
    .sort((a, b) => a.sectorCode.localeCompare(b.sectorCode));
};
