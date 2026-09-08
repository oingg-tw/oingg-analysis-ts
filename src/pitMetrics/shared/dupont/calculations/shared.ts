import type { MetricNullReason } from '../../../metricBasis';

// dupont 家族每個 metricCode 的計算公式（calculations/ 底下）共用的泛用數字工具——這些不是
// 任何單一指標的公式本身，是「怎麼把 bigint 財報數字換算成百分比/倍數、怎麼判斷缺輸入原因」
// 這種跨指標共用的機制，所以留在這裡而不是拆進個別指標檔案。2026-09-08 從
// computeDupontFamilyPit.ts 拆出（原本跟編排邏輯混在同一個檔案），維持完全相同的行為。

export interface CalcResult {
  value: number | null;
  nullReason: MetricNullReason | null;
}

export const pickNetIncome = (record: { netIncomeAttributableToParent: bigint | null; netIncome: bigint | null } | null): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.netIncomeAttributableToParent !== null) return { value: record.netIncomeAttributableToParent };
  if (record.netIncome !== null) return { value: record.netIncome };
  return { value: null };
};

export const pickEquity = (record: { equityAttributableToParent: bigint | null; totalEquity: bigint | null } | null): { value: bigint | null } => {
  if (!record) return { value: null };
  if (record.equityAttributableToParent !== null) return { value: record.equityAttributableToParent };
  if (record.totalEquity !== null) return { value: record.totalEquity };
  return { value: null };
};

export const toPct = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100 * 100) / 100;
};

// 比率型（「次」）的四捨五入到小數 2 位，跟 turnoverRatio 的 toTurnover 一致。
export const toRatio = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100) / 100;
};

export const round2 = (x: number): number => Math.round(x * 100) / 100;

// 分子/分母任一為 null 視為缺輸入；兩者皆非 null 但分母為 0 才是「分母為零」——負值不擋，
// 沿用既有「扭曲但仍是真實數字」的行為。
export const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};
