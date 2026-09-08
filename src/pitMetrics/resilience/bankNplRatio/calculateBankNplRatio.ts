import type { CalcResult } from '@/pitMetrics/numericHelpers';

// bankNplRatio（逾放比）——直接讀 mops-ts 已經算好的比率，本服務不用自己推公式（銀行監理
// 揭露格式本來就要求申報比率，見
// pitMetrics/resilience/bankAssetQuality/computeBankAssetQualityFamilyPit.ts 檔頭說明）。
// 這裡只是把「查無資料時回報 missing_input」這條規則封裝起來，跟其他指標的 calculateXxx()
// 保持同一種形狀，方便呼叫端統一處理。
export const calculateBankNplRatio = (nonPerformingLoansRatio: number | null | undefined): CalcResult => ({
  value: nonPerformingLoansRatio ?? null,
  nullReason: nonPerformingLoansRatio == null ? 'missing_input' : null,
});
