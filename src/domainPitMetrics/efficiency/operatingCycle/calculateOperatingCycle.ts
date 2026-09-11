import { round2, type CalcResult } from '@/domainPitMetrics/numericHelpers';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——營運週期
// = DIO + DSO（不扣 DPO，跟 cashConversionCycle 的差異是這支不考慮付款緩衝期，純衡量
// 從進貨到收現的完整週期），兩個天數指標任一為 null 就視為缺輸入。
export const calculateOperatingCycle = (inventoryDays: number | null, receivablesDays: number | null): CalcResult => {
  const value = inventoryDays !== null && receivablesDays !== null ? round2(inventoryDays + receivablesDays) : null;
  const nullReason = value === null ? 'missing_input' : null;
  return { value, nullReason };
};
