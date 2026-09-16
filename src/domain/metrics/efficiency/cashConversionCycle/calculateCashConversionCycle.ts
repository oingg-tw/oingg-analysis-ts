import { round2, type CalcResult } from '@/domain/metrics/shared/numericHelpers';

// cashConversionCycle（CCC）= DIO + DSO − DPO——現金轉換循環，三個天數指標任一為 null
// 就視為缺輸入，不細分是哪一個缺。
export const calculateCashConversionCycle = (inventoryDays: number | null, receivablesDays: number | null, payablesDays: number | null): CalcResult => {
  const value = inventoryDays !== null && receivablesDays !== null && payablesDays !== null ? round2(inventoryDays + receivablesDays - payablesDays) : null;
  const nullReason = value === null ? 'missing_input' : null;
  return { value, nullReason };
};
