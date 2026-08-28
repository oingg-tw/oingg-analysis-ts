import type { Season } from '@/shared/rocQuarter';

export interface RoicQuery {
  companyId: string;
  year: string; // 民國年，例如 "115"
  season: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface RoicResult {
  companyId: string;
  year: string;
  season: Season;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // ROIC 投入資本回報率 = NOPAT / 投入資本（Invested Capital） * 100，跟 ROE/ROA 同一種
  // 單季/年化/TTM 三數值結構（流量對存量比率，分母是期末餘額，不是平均值）。
  // NOPAT（稅後淨營業利潤） = EBIT x (1 - 有效稅率)；有效稅率 = 本季所得稅費用 / 本季稅前淨利，
  // 稅前淨利為零或負數時有效稅率沒有意義，該季 NOPAT 視為無法計算。
  // 投入資本 = 有息負債（短期借款+應付公司債+長期借款） + 權益 - 現金及約當現金，
  // 有息負債/權益口徑跟 deRatio 一致，「扣現金」是常見做法（排除非用於營運的超額現金部位）。
  roicQuarterlyPct: number | null;
  roicQuarterlyAnnualizedPct: number | null;
  // TTM = 近四季（含本季）各季 NOPAT 加總 / 本季期末投入資本 * 100
  roicTtmPct: number | null;

  nopat: {
    value: string | null; // BigInt as string（四捨五入到整數）；本季 NOPAT
  };
  nopatTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  investedCapital: {
    value: string | null; // BigInt as string；本季期末投入資本
  };
  equity: {
    fieldUsed: 'equityAttributableToParent' | 'totalEquity' | null;
    value: string | null; // BigInt as string
  };

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  warnings: string[];
}
