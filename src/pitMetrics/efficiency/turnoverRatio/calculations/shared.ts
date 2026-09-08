import type { MetricNullReason } from '../../../metricBasis';

// turnoverRatio 家族每個 metricCode 的計算公式（calculations/ 底下）共用的泛用數字工具，
// 2026-09-08 從 computeTurnoverRatioFamilyPit.ts 拆出，維持完全相同的行為。

export interface CalcResult {
  value: number | null;
  nullReason: MetricNullReason | null;
}

export interface TurnoverCalcResult extends CalcResult {
  quarterlyAnnualized: number | null;
}

export const toTurnover = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100) / 100;
};

// DIO/DSO/DPO = 365/年化或TTM周轉率。周轉率為 0 時無法換算天數，回傳 null。
export const toDays = (turnover: number | null): number | null => {
  if (turnover === null || turnover === 0) return null;
  return Math.round((365 / turnover) * 100) / 100;
};

export const round2 = (x: number): number => Math.round(x * 100) / 100;

export const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};

// 天數指標（DIO/DSO/DPO）null_reason：對應周轉率本身為 0（除以零）回報
// zero_or_negative_denominator；周轉率本身就是 null，原因照搬周轉率自己的 nullReason。
export const daysNullReason = (turnover: number | null, turnoverNullReason: MetricNullReason | null): MetricNullReason => {
  if (turnover === 0) return 'zero_or_negative_denominator';
  return turnoverNullReason ?? 'missing_input';
};
