// 供給面股權風險溢酬（supply-side ERP），照 Ibbotson & Chen (2003)〈Long-Run Stock Returns: Participating in the Real Economy〉
// （Financial Analysts Journal 59(1)）的做法：股票長期報酬由公司「供給」的部分構成——通膨、實質盈餘成長、股利——
// 再減掉無風險利率；本益比擴張不是公司供給的報酬、不預期持續，所以不計入。常見的寫法：
//   ERP = (1 + i)(1 + g)(1 + ΔPE) − 1 + Y − Rf，ΔPE = 0
// 全部是百分比數字（2.5 代表 2.5%）。各輸入怎麼取在 application/macro/equityRiskPremium/service.ts 說明。

const mean = (xs: number[]): number => xs.reduce((sum, x) => sum + x, 0) / xs.length;

// 一串年增率（%）的幾何平均年增率（%）；空陣列回 null。
export const geometricMeanPercent = (percents: number[]): number | null =>
  percents.length === 0 ? null : (Math.exp(mean(percents.map((p) => Math.log(1 + p / 100)))) - 1) * 100;

// 市值加權平均（%）：只用「值跟權重都有、權重 > 0」的列；coveragePercent 是納入計算的權重占全部有權重列的比例。
export const capWeightedMeanPercent = (
  rows: { value: number | null; weight: number | null }[]
): { mean: number; count: number; coveragePercent: number } | null => {
  const weighted = rows.filter((r): r is { value: number; weight: number } => r.value !== null && r.weight !== null && r.weight > 0);
  const totalWeight = rows.reduce((sum, r) => sum + (r.weight !== null && r.weight > 0 ? r.weight : 0), 0);
  const usedWeight = weighted.reduce((sum, r) => sum + r.weight, 0);
  if (weighted.length === 0 || usedWeight === 0) return null;
  return {
    mean: weighted.reduce((sum, r) => sum + r.value * r.weight, 0) / usedWeight,
    count: weighted.length,
    coveragePercent: (usedWeight / totalWeight) * 100,
  };
};

export const supplySideErpPercent = (inflation: number, realGrowth: number, dividendYield: number, riskFree: number): number =>
  ((1 + inflation / 100) * (1 + realGrowth / 100) - 1) * 100 + dividendYield - riskFree;
