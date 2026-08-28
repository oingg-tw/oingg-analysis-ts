import type { Season } from '@/shared/rocQuarter';

export interface SgrQuery {
  companyId: string;
  year: string; // 民國年，例如 "115"
  season: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface SgrResult {
  companyId: string;
  year: string;
  season: Season;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // SGR 可持續成長率 = ROE(TTM) x (1 - 配息率(TTM))。直接引用 roe/、dividendPayoutRatio/ 已經算好的
  // roeTtmPct、payoutRatioTtm，不重複查詢——複合指標，只有 TTM 口徑（因為配息率本身只有 TTM 口徑）。
  sgrTtm: number | null;

  roeTtm: {
    value: number | null; // 引用自 GET /profitability/roe 的 roeTtmPct
  };
  payoutRatioTtm: {
    value: number | null; // 引用自 GET /profitability/dividend-payout-ratio 的 payoutRatioTtm
  };

  warnings: string[];
}
