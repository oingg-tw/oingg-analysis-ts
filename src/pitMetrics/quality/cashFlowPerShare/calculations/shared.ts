import type { MetricNullReason } from '../../../metricBasis';

export interface CalcResult {
  value: number | null;
  nullReason: MetricNullReason | null;
}

export interface PerShareCalcResult extends CalcResult {
  quarterlyAnnualized: number | null;
}

export const toPerShare = (numeratorInThousands: bigint, shares: bigint): number | null => {
  if (shares === 0n) return null;
  return Math.round(((Number(numeratorInThousands) * 1000) / Number(shares)) * 100) / 100;
};

export const determineNullReason = (numerator: bigint | null, denominator: bigint | null): MetricNullReason => {
  if (numerator === null || denominator === null) return 'missing_input';
  return 'zero_or_negative_denominator';
};
