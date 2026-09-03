import type { Season } from '@/shared/rocQuarter';

export interface TurnoverRatioQuery {
  companyId: string;
  // year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
  // （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface TurnoverRatioResult {
  companyId: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // 存貨周轉率（次）= 本季營業成本 / 本季期末存貨
  inventoryTurnoverQuarterly: number | null;
  inventoryTurnoverQuarterlyAnnualized: number | null;
  // TTM = 近四季（含本季）營業成本加總 / 本季期末存貨
  inventoryTurnoverTtm: number | null;

  // 應收帳款周轉率（次）= 本季營收 / 本季期末應收帳款
  receivablesTurnoverQuarterly: number | null;
  receivablesTurnoverQuarterlyAnnualized: number | null;
  receivablesTurnoverTtm: number | null;

  // 總資產周轉率（次）= 本季營收 / 本季期末總資產
  assetTurnoverQuarterly: number | null;
  assetTurnoverQuarterlyAnnualized: number | null;
  assetTurnoverTtm: number | null;

  // 固定資產周轉率（次）= 本季營收 / 本季期末不動產、廠房及設備（propertyPlantEquipment）
  fixedAssetTurnoverQuarterly: number | null;
  fixedAssetTurnoverQuarterlyAnnualized: number | null;
  fixedAssetTurnoverTtm: number | null;

  // 應付帳款周轉率（次）= 本季營業成本 / 本季期末應付帳款——DPO 的「次數」版本，跟其他三個周轉率同一種結構。
  payablesTurnoverQuarterly: number | null;
  payablesTurnoverQuarterlyAnnualized: number | null;
  payablesTurnoverTtm: number | null;

  // DIO/DSO/DPO（週轉天數）= 365 / 周轉率（年化版本）。只提供年化跟 TTM 兩種口徑，
  // 不提供「單季未年化」版本——365 / 單季周轉率算出來是「一季裡的天數」，不是有意義的「週轉天數」，
  // 週轉天數的定義本來就是以一年為基準（跟 turnoverRatio 本身可以只看單季次數不同）。
  inventoryDaysQuarterlyAnnualized: number | null; // DIO
  inventoryDaysTtm: number | null;
  receivablesDaysQuarterlyAnnualized: number | null; // DSO
  receivablesDaysTtm: number | null;
  payablesDaysQuarterlyAnnualized: number | null; // DPO
  payablesDaysTtm: number | null;

  // CCC 現金轉換週期 = DIO + DSO - DPO，同樣只有年化跟 TTM 兩種口徑（依賴上面三組天數）。
  cashConversionCycleQuarterlyAnnualized: number | null;
  cashConversionCycleTtm: number | null;

  operatingCost: {
    value: string | null; // BigInt as string；本季營業成本
  };
  operatingCostTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  operatingRevenue: {
    value: string | null; // BigInt as string；本季營收
  };
  operatingRevenueTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };

  inventory: {
    value: string | null; // BigInt as string；本季期末存貨（分母，用期末值，不是平均值）
  };
  accountsReceivable: {
    value: string | null; // BigInt as string；本季期末應收帳款
  };
  totalAssets: {
    value: string | null; // BigInt as string；本季期末總資產
  };
  propertyPlantEquipment: {
    value: string | null; // BigInt as string；本季期末不動產、廠房及設備
  };
  accountsPayable: {
    value: string | null; // BigInt as string；本季期末應付帳款
  };

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  warnings: string[];
}
