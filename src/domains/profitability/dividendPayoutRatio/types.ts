import type { Season } from '@/shared/rocQuarter';

export interface DividendPayoutRatioQuery {
  companyId: string;
  // year/season 選填但要成對——不給就自動抓「這家公司損益表跟現金流量表都有資料」的最新一季
  // （見 shared/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface DividendPayoutRatioResult {
  companyId: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // 配息率只提供 TTM 口徑，不提供單季版本：現金股利通常一年只發放一到兩次（不是每季平均發），
  // 單季配息率會因為「剛好有沒有發股利的那一季」劇烈失真，近四季加總才是有意義的年度口徑。
  // payoutRatioTtm = |近四季現金股利發放（dividendsPaid）加總| / 近四季淨利加總 * 100。
  payoutRatioTtm: number | null;

  dividendsPaid: {
    value: string | null; // BigInt as string；本季現金股利發放（現金流量表原始值，通常是負數，代表現金流出）
  };
  dividendsPaidTtm: {
    value: string | null; // BigInt as string；近四季加總（負數），資料不齊則為 null
  };
  netIncome: {
    fieldUsed: 'netIncomeAttributableToParent' | 'netIncome' | null;
    value: string | null; // BigInt as string；本季淨利
  };
  netIncomeTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  warnings: string[];
}
