import type { IndustryReferenceDataPort } from '@/application/ports/industryReference';
import { getIndustryNodeInfo, listIndustryChildren, listIndustryCompanies, listAllCompanyIndustryPaths } from '@/infrastructure/repositories/gov/industryClassification';
import { listAllCompanyCategories, listCategoryGroups, getCompanyCategoryInfo } from '@/infrastructure/repositories/playwright/industryChainClassification';
import { listIndustryClusters, getExternalCompanyName } from '@/infrastructure/repositories/playwright/industryClusters';
import { listIndustryTree, findPeerGroupByTree } from '@/infrastructure/repositories/playwright/industryTree';
import { listSecuritiesIndustrySectors } from '@/infrastructure/repositories/exchange/securitiesIndustry';

// application/ports/industryReference.ts 的實作——把三處 repository 的啟動快取存取器組成一個 port 物件，
// src/bootstrap/deps.ts 綁進 AppDeps。快取本身仍由 src/bootstrap/warmCaches.ts 在 listen 前載入
// （loadIndustryClassification / loadIndustryChainClassification / loadIndustryClusters / loadIndustryTree）。
export const industryReferenceData: IndustryReferenceDataPort = {
  getIndustryNodeInfo,
  listIndustryChildren,
  listIndustryCompanies,
  listAllCompanyIndustryPaths,
  listAllCompanyCategories,
  listCategoryGroups,
  listIndustryClusters,
  getExternalCompanyName,
  listIndustryTree,
  getCompanyCategoryInfo,
  findPeerGroupByTree,
  listSecuritiesIndustrySectors,
};
