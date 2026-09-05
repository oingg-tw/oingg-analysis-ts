import { z } from 'zod';

// docs/analysis-ts-spec-v0.2.md §4.3 已定案字彙。DB 欄位是 String（見 schema.prisma 的
// MetricValue.basis 註解），這裡做應用層驗證——刻意不用 Postgres enum，理由同上引註解：
// 這組字彙要能「擴充不動 schema」。
export const metricBasisSchema = z.enum(['Q', 'CUM', 'TTM', 'Q_ANN', 'FY']);
export type MetricBasis = z.infer<typeof metricBasisSchema>;

// 只有 value 為 null 時才有意義。
export const metricNullReasonSchema = z.enum([
  'missing_input',
  'zero_or_negative_denominator',
  'not_applicable_industry',
  'insufficient_history',
]);
export type MetricNullReason = z.infer<typeof metricNullReasonSchema>;
