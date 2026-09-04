import type { Season } from '@/shared/rocQuarter';
import type { MetricStatus } from '@/shared/metricStatus';

export interface NissimPenmanRnoaQuery {
  symbol: string;
  // year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
  // （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string;
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface NissimPenmanRnoaResult {
  symbol: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // ROE = RNOA + (FLEV x SPREAD)——見 src/domainBatch/metrics/guru/README.md「Nissim_Penman_RNOA 卡在哪裡」。
  // RNOA（本業報酬率） = NOPAT / NOA，跟 ROE/ROIC 同一種單季/年化/TTM 三數值結構。
  rnoaQuarterlyPct: number | null;
  rnoaQuarterlyAnnualizedPct: number | null;
  rnoaTtmPct: number | null;

  // FLEV（財務槓桿） = NFO / 權益，純資產負債表時點快照，單季/TTM 共用同一個值——跟 dupont 的
  // equityMultiplier 是同一種道理。是原始比率（倍數），不是百分比。
  flev: number | null;

  // NBC（淨借貸利率） = 利息費用 / NFO；SPREAD = RNOA - NBC。都分單季/TTM，用來配對同期的 RNOA。
  nbcQuarterlyPct: number | null;
  nbcTtmPct: number | null;
  spreadQuarterlyPct: number | null;
  spreadTtmPct: number | null;

  // 用 RNOA + FLEV x SPREAD 重新組裝出來的 ROE，理論上應該接近（不必完全相等）roe/ 直接算出來、
  // 原樣回傳的 actualRoeQuarterlyPct/actualRoeTtmPct——兩者對照可以互相驗證拆解邏輯是否一致，
  // 小數點誤差是四捨五入造成的正常現象，跟 dupont 的交叉驗證設計同一個精神。
  reconstructedRoeQuarterlyPct: number | null;
  reconstructedRoeTtmPct: number | null;
  actualRoeQuarterlyPct: number | null;
  actualRoeTtmPct: number | null;

  nopat: {
    value: string | null; // BigInt as string（四捨五入到整數）；本季 NOPAT = 營業利益 x (1 - 有效稅率)
  };
  nopatTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  noa: {
    value: string | null; // BigInt as string；淨營業資產 = 權益 + NFO
  };
  nfo: {
    value: string | null; // BigInt as string；淨金融負債 = 有息負債 - 現金及約當現金
  };
  equity: {
    fieldUsed: 'equityAttributableToParent' | 'totalEquity' | null;
    value: string | null; // BigInt as string
  };

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
