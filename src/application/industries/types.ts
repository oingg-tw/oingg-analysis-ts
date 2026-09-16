import type { CategoryGroupListEntry, IndustryChainTreeNodeType, IndustryLevel, IndustryPathNode, IndustryTreeChildSummary, SecuritiesIndustrySector } from '@/application/ports/industryReference';

// GET /industries/* 的回應形狀（application 真理來源）——http/modules/industries/types.ts 的 zod schema 用
// satisfies 釘住（chain tree 那份除外，遞迴形狀的 OpenAPI schema 只能用 z.unknown() 終止，見該檔說明）。

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

export interface ChainClassificationCompany {
  symbol: string;
  companyName: string | null;
  category: string | null;
  coarseGroup: string | null;
  source: 'keyword' | 'gemini' | null;
  updatedAt: string | null; // YYYY-MM-DD
}

export interface ChainClassificationResult {
  companies: ChainClassificationCompany[];
  groups: CategoryGroupListEntry[];
}

export interface ChainClusterMember {
  code: string;
  name: string | null;
  isListed: boolean;
}

export interface ChainClusterSubGroup {
  subClusterId: number;
  subLabel: string | null;
  members: ChainClusterMember[];
}

export interface ChainCluster {
  clusterId: number;
  label: string | null;
  metaGroup: string | null;
  directMembers: ChainClusterMember[];
  subClusters: ChainClusterSubGroup[];
}

export interface ChainClustersResult {
  clusters: ChainCluster[];
}

export interface IndustryChainTreeResultNode {
  nodeId: string;
  nodeType: IndustryChainTreeNodeType;
  label: string | null;
  depth: number;
  size: number | null;
  children: IndustryChainTreeResultNode[];
  members: IndustryCompanyEntry[];
}

export interface IndustryChainTreeResult {
  roots: IndustryChainTreeResultNode[];
}

export interface SecuritiesIndustrySectorsResult {
  sectors: SecuritiesIndustrySector[];
}
