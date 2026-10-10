import type { SectorDividendSummary } from '@/domain/industry/sectorDividendSummary';
import type { QuartileSummary, SectorMonthlyRevenue, SectorPeriodSummary } from '@/domain/industry/sectorAggregates';

// GET /industries/* 的回應形狀（application 真理來源）——http/modules/industries/types.ts 的 zod schema 用
// satisfies 釘住。
//
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類，原本這裡的
// ChainClassification*/ChainCluster*/IndustryChainTree* 型別（對應已刪除的 GET /industries/
// chain-{classification,clusters,tree} 三支端點）已移除。

// 2026-10-10 詞彙表：sectorCode／sectorName 是官方名（舊的 code／name 2026-10-11 移除）。
export interface SecuritiesIndustrySectorsResult {
  sectors: { sectorCode: string; sectorName: string; companyCount: number }[];
}

export interface SectorDividendSummaryResult {
  dividendYieldTradeDate: string | null; // 殖利率母體裡最新的交易日（YYYY-MM-DD）
  sectors: SectorDividendSummary[];
}

// 2026-10-09 web-nuxt 產業分析三支類股端點（見 service.ts 的 getSector* 三支）。
export interface SectorMetricHistoryResult {
  sectorCode: string;
  sectorName: string;
  metricCode: string;
  timeframe: string;
  entries: SectorPeriodSummary[]; // 由舊到新
}

export interface SectorMonthlyRevenueHistoryResult {
  sectorCode: string;
  sectorName: string;
  total: number;
  hasMore: boolean;
  entries: SectorMonthlyRevenue[]; // 由舊到新
}

export interface SectorSummaryResult {
  sectors: { sectorCode: string; sectorName: string; companyCount: number; fields: Record<string, QuartileSummary> }[];
}
