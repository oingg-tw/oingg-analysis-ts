import type { SectorDividendSummary } from '@/domain/industry/sectorDividendSummary';
import type { SecuritiesIndustrySector } from '@/application/ports/industryReference';

// GET /industries/* 的回應形狀（application 真理來源）——http/modules/industries/types.ts 的 zod schema 用
// satisfies 釘住。
//
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類，原本這裡的
// ChainClassification*/ChainCluster*/IndustryChainTree* 型別（對應已刪除的 GET /industries/
// chain-{classification,clusters,tree} 三支端點）已移除。

export interface SecuritiesIndustrySectorsResult {
  sectors: SecuritiesIndustrySector[];
}

export interface SectorDividendSummaryResult {
  dividendYieldTradeDate: string | null; // 殖利率母體裡最新的交易日（YYYY-MM-DD）
  sectors: SectorDividendSummary[];
}
