import type { Season } from '@/shared/rocQuarter';
import type { MetricStatus } from '@/shared/metricStatus';

export interface RoceQuery {
  symbol: string;
  // year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
  // （見 shared/sourceData/latestQuarter.ts），只給其中一個視為無效請求（在 controller 用 zod refine 擋掉）。
  year?: string; // 民國年，例如 "115"
  season?: Season;
  dataType: '1' | '2'; // 1 = 個體, 2 = 合併
  subsidiaryCompanyId: string;
}

export interface RoceResult {
  symbol: string;
  // 實際使用的季度（不論是查詢時指定的，還是自動抓最新的）；查無任何季度資料時為 null。
  year: string | null;
  season: Season | null;
  dataType: '1' | '2';
  subsidiaryCompanyId: string;
  reportDate: string | null;

  // ROCE 使用資本報酬率 = EBIT / (總資產 - 流動負債) * 100，跟 ROE/ROA 同一種單季/年化/TTM 三數值結構
  // （流量對存量比率，分母是期末餘額，不是平均值——跟 ROE 用期末權益同一種刻意簡化）。
  // EBIT = 稅前淨利（profitBeforeTax） + 利息費用（financeCosts），算法跟 interestCoverage/netDebtToEbitda 一致。
  // 分母「總資產 - 流動負債」= 使用資本（Capital Employed），代表公司實際投入營運的長期資金（權益 + 長期負債）。
  roceQuarterlyPct: number | null;
  roceQuarterlyAnnualizedPct: number | null;
  // TTM = 近四季（含本季）EBIT 加總 / 本季期末使用資本 * 100
  roceTtmPct: number | null;

  ebit: {
    value: string | null; // BigInt as string；本季 EBIT
  };
  ebitTtm: {
    value: string | null; // BigInt as string；近四季加總，資料不齊則為 null
  };
  capitalEmployed: {
    value: string | null; // BigInt as string；本季期末總資產 - 流動負債
  };

  ttm: {
    quartersUsed: string[];
    quartersMissing: string[];
  };

  fieldStatuses: Record<string, MetricStatus>;
  warnings: string[];
}
