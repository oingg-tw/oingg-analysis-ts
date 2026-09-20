import type { IndustryLevel, IndustryPathNode, IndustryTreeChildSummary, SecuritiesIndustrySector } from '@/application/ports/industryReference';

// GET /industries/* 的回應形狀（application 真理來源）——http/modules/industries/types.ts 的 zod schema 用
// satisfies 釘住。
//
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類，原本這裡的
// ChainClassification*/ChainCluster*/IndustryChainTree* 型別（對應已刪除的 GET /industries/
// chain-{classification,clusters,tree} 三支端點）已移除。

export interface IndustryCompanyEntry {
  symbol: string;
  companyName: string | null;
}

export interface IndustryTreeNodeResult {
  found: boolean; // false 代表帶了 code 但查無此產業分類代碼；不給 code（查樹根）恆為 true
  code: string | null; // null 代表這是樹根
  level: IndustryLevel | null;
  name: string | null;
  companyCount: number;
  children: IndustryTreeChildSummary[];
  companies: IndustryCompanyEntry[];
}

export interface IndustryFlatCompany {
  symbol: string;
  companyName: string | null;
  path: IndustryPathNode[];
}

export interface IndustryFlatResult {
  companies: IndustryFlatCompany[];
}

export interface SecuritiesIndustrySectorsResult {
  sectors: SecuritiesIndustrySector[];
}
