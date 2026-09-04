import type { Season } from '@/shared/rocQuarter';

export interface GrahamNumberQuery {
  symbol: string;
  // year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
  // （eps/bvps 兩個組成指標各自需要的表的聯集，見 shared/sourceData/latestQuarter.ts），只給其中一個視為
  // 無效請求（在 controller 用 zod refine 擋掉）。解析出來的具體季度會原樣往下傳給 eps/bvps，
  // 不是把 undefined 傳下去讓它們各自再解析一次——避免兩個組成指標各自解析出不同季度。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface GrahamNumberResult {
  symbol: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
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
