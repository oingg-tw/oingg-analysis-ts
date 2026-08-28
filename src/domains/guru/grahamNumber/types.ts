import type { Season } from '@/shared/rocQuarter';

export interface GrahamNumberQuery {
  companyId: string;
  year: string; // 民國年，例如 "115"
  season: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface GrahamNumberResult {
  companyId: string;
  year: string;
  season: Season;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // 葛拉漢數 = sqrt(22.5 x EPS(TTM) x BVPS)。
  // 出處：本益比不超過 15 倍、股價淨值比不超過 1.5 倍，兩者乘積上限 15 x 1.5 = 22.5，
  // 推導出合理價上限 sqrt(22.5 x EPS x BVPS)。EPS 用 TTM（近四季滾動），不是單季或簡單年化——
  // 這是本服務第一個複合指標，直接引用已經做好的 eps/、bvps/ 服務算出來的值，不重複實作查詢邏輯。
  grahamNumber: number | null;

  epsTtm: {
    value: number | null; // 引用自 GET /profitability/eps 的 epsTtm
  };
  bvps: {
    value: number | null; // 引用自 GET /profitability/bvps 的 bvps
  };

  warnings: string[];
}
