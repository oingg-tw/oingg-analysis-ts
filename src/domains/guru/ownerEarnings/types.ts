import type { Season } from '@/shared/rocQuarter';

export interface OwnerEarningsQuery {
  companyId: string;
  // year/season 選填但要成對——不給就自動抓「這家公司損益表跟現金流量表都有資料」的最新一季
  // （見 shared/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface OwnerEarningsResult {
  companyId: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // 巴菲特股東盈餘（每股） = (淨利 + 折舊 + 攤銷 + 資本支出) x 1000 / 流通股數。
  // capitalExpenditures 在資料庫裡本身是負數（現金流出），所以是加不是減——跟 cashFlowPerShare 的
  // FCF 算法同一個坑。taxonomy 原文的股東盈餘（Owner Earnings）是公司總額，本服務跟 FCF 一樣改成
  // **每股版本**，因為這是接續 EPS/BVPS/每股營收/每股現金流那條「每股基礎指標」的脈絡做的，
  // 詳見 guru/README.md 說明。用「總資本支出」代替 taxonomy 定義的「維護性資本支出」（Maintenance
  // CapEx）——財報沒有拆分維護性/成長性資本支出，這是跟 FCF 一樣的簡化，數值會比嚴格定義的股東盈餘保守。
  ownerEarningsPerShareQuarterly: number | null;
  ownerEarningsPerShareQuarterlyAnnualized: number | null;
  // TTM = 近四季（含本季）淨利、折舊、攤銷、資本支出各自加總後再除以流通股數
  ownerEarningsPerShareTtm: number | null;

  netIncome: {
    fieldUsed: 'netIncomeAttributableToParent' | 'netIncome' | null;
    value: string | null; // BigInt as string；本季淨利
  };
  netIncomeTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  depreciationAndAmortization: {
    value: string | null; // BigInt as string；本季折舊 + 攤銷
  };
  depreciationAndAmortizationTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  capitalExpenditures: {
    value: string | null; // BigInt as string；本季資本支出（現金流量表原始值，負數）
  };
  capitalExpendituresTtm: {
    value: string | null; // BigInt as string；近四季加總（負數），資料不齊則為 null
  };

  paidInShares: {
    value: string | null; // BigInt as string
    effectiveYear: number | null;
    effectiveMonth: number | null;
  };

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  warnings: string[];
}
