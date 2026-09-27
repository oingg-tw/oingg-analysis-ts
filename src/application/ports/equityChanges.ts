import type { AnnualEquityChange } from '@/domain/financials/bookValueBreakdown';

// 2026-09-27 權益變動表的年度數字（淨值變動拆解用，見 domain/financials/bookValueBreakdown.ts）。實作在
// infrastructure/repositories/mops/equityChangeXbrl.ts（mops-ts export.equity_change_xbrl 第四季＝全年）。
export interface AnnualEquityChangeRow extends AnnualEquityChange {
  rocYear: number;
}

export interface EquityChangePort {
  // 由舊到新；只回有第四季（全年）權益變動表的年度。
  listAnnualEquityChanges(symbol: string, dataType: '1' | '2'): Promise<AnnualEquityChangeRow[]>;
}
