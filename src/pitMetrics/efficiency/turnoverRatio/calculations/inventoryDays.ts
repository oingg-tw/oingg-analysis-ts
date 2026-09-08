import type { MetricNullReason } from '../../../metricBasis';
import { toDays, daysNullReason, type CalcResult } from './shared';

// inventoryDays（DIO）= 365 ÷ 存貨周轉率（年化或 TTM 版本）——套用在哪個 basis 由呼叫端
// 決定（Q_ANN 傳年化周轉率、TTM 傳 TTM 周轉率），公式本身不變。
export const calculateInventoryDays = (turnover: number | null, turnoverNullReason: MetricNullReason | null): CalcResult => {
  const value = toDays(turnover);
  const nullReason = value === null ? daysNullReason(turnover, turnoverNullReason) : null;
  return { value, nullReason };
};
