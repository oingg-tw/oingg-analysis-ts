import type { AppDeps } from '@/application/deps';
import type { IndustryFlatResult, IndustryTreeNodeResult, SecuritiesIndustrySectorsResult } from './types';

// 2026-09-17 Phase 4：從 http/modules/industries/controller.ts 搬來，快取存取器改走 deps.industryReference、
// 公司名稱改走 deps.companyProfiles，邏輯逐字不變。
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類，原本這裡的 getIndustryChainClassification/
// getIndustryChainClusters/getIndustryChainTree 三個 use case（對應已刪除的 GET /industries/
// chain-{classification,clusters,tree} 三支端點）已移除。
export type IndustriesDeps = Pick<AppDeps, 'industryReference' | 'companyProfiles'>;

// 給「產業追蹤」樹狀瀏覽頁面用——純瀏覽語意，不做動態層級回退，見 industryClassification.ts 的說明。
export const getIndustryTree = async (code: string | null, deps: IndustriesDeps): Promise<IndustryTreeNodeResult> => {
  const nodeInfo = deps.industryReference.getIndustryNodeInfo(code);
  if (!nodeInfo) {
    return { found: false, code, level: null, name: null, companyCount: 0, children: [], companies: [] };
  }

  const children = deps.industryReference.listIndustryChildren(code);
  const companySymbols = code === null ? [] : deps.industryReference.listIndustryCompanies(code);
  const nameMap = await deps.companyProfiles.getCompanyNamesForSymbols(companySymbols);

  return {
    found: true,
    code: nodeInfo.code,
    level: nodeInfo.level,
    name: nodeInfo.name,
    companyCount: nodeInfo.companyCount,
    children,
    companies: companySymbols.map((symbol) => ({ symbol, companyName: nameMap.get(symbol) ?? null })),
  };
};

// 2026-09-09 應 bff-ts 要求新增——給「產業追蹤」頁的搜尋功能用（股票代號或分類名稱關鍵字
// 跳到樹狀節點），一次回傳全部已分類公司的 symbol -> 完整路徑對照表，前端自己建索引，不用
// 遞迴打 ~999 次 GET /industries/tree。見 industryClassification.ts 的
// listAllCompanyIndustryPaths() 說明。沒有查詢參數，純讀記憶體快取，成本低。
export const getIndustryFlat = async (deps: IndustriesDeps): Promise<IndustryFlatResult> => {
  const paths = deps.industryReference.listAllCompanyIndustryPaths();
  const nameMap = await deps.companyProfiles.getCompanyNamesForSymbols(paths.map((p) => p.symbol));
  return {
    companies: paths.map((p) => ({ symbol: p.symbol, companyName: nameMap.get(p.symbol) ?? null, path: p.path })),
  };
};

// 2026-09-11 應使用者要求新增——給 screener 的 industryCodes 產業篩選（見
// application/screener）取得合法代碼用，也可以單獨拿來做類股瀏覽 UI。跟上面
// GET /industries/tree 是不同分類體系（證交所類股 vs 財政部稅籍），刻意獨立端點，不合併。
export const getSecuritiesIndustrySectors = async (deps: Pick<AppDeps, 'industryReference'>): Promise<SecuritiesIndustrySectorsResult> => {
  const sectors = await deps.industryReference.listSecuritiesIndustrySectors();
  return { sectors };
};
