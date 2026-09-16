import type { AppDeps } from '@/application/deps';
import type { IndustryChainTreeNode } from '@/application/ports/industryReference';
import type {
  ChainClassificationResult,
  ChainClusterMember,
  ChainClustersResult,
  IndustryChainTreeResult,
  IndustryChainTreeResultNode,
  IndustryFlatResult,
  IndustryTreeNodeResult,
  SecuritiesIndustrySectorsResult,
} from './types';

// 2026-09-17 Phase 4：從 http/modules/industries/controller.ts 搬來，快取存取器改走 deps.industryReference、
// 公司名稱改走 deps.companyProfiles，邏輯逐字不變。
export type IndustriesDeps = Pick<AppDeps, 'industryReference' | 'companyProfiles'>;

// 給「產業追蹤」樹狀瀏覽頁面用——純瀏覽語意，不做動態層級回退（跟 GET /companies/peer-group
// 的 findPeerGroup 是刻意分開的兩種查詢），見 industryClassification.ts 的說明。
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

// 2026-09-14 應 web-nuxt 要求新增——「產業追蹤」頁面重建成 playwright-py 供應鏈分類（取代
// 舊版用 GET /industries/tree/flat 的 gov-ts 稅籍分類樹），一次回傳全部公司的分類 +
// 10 組粗分類對照表，讓前端自己做 drill-down（粗分類 -> 細分類 -> 公司），不用逐一查詢。
// 跟 GET /companies/peer-group（單一公司找同業）是同一份底層快取，但用途不同，刻意分開：
// 這支是批次瀏覽（比照舊版 GET /industries/flat 的精神），那支是單一公司查詢。
export const getIndustryChainClassification = async (deps: IndustriesDeps): Promise<ChainClassificationResult> => {
  const companies = deps.industryReference.listAllCompanyCategories();
  const nameMap = await deps.companyProfiles.getCompanyNamesForSymbols(companies.map((c) => c.symbol));
  return {
    companies: companies.map((c) => ({
      symbol: c.symbol,
      companyName: nameMap.get(c.symbol) ?? null,
      category: c.category,
      coarseGroup: c.coarseGroup,
      source: c.source,
      updatedAt: c.updatedAt?.toISOString().slice(0, 10) ?? null,
    })),
    groups: deps.industryReference.listCategoryGroups(),
  };
};

// 2026-09-14 應 web-nuxt 要求新增（第二輪，聚落樹）——playwright-py 的供應鏈聚落分群
// （人工中文標籤，見 industryClusters.ts 檔頭關於分群演算法/數量會變動的完整說明），
// 跟上面 getIndustryChainClassification 的 category/coarseGroup 是完全獨立的另一套
// 分群概念（⚠️ cluster_id 不穩定，前端不能拿它當永久識別碼快取）。一次回傳整棵樹
// （全部頂層聚落 + 子聚落 + 全部成員），成員 code 混雜上市櫃公司跟外部/非上市公司
// （供應鏈脈絡完整度優先），isListed 標示這個 code 查不查得到 twse/tpex company_profile，
// 前端可以用這個欄位決定要不要讓使用者點進公司
// 詳情頁（非上市公司沒有對應的個股頁面）。
export const getIndustryChainClusters = async (deps: IndustriesDeps): Promise<ChainClustersResult> => {
  const clusters = deps.industryReference.listIndustryClusters();
  const allCodes = clusters.flatMap((c) => [...c.directMemberCodes, ...c.subClusters.flatMap((s) => s.memberCodes)]);
  const nameMap = await deps.companyProfiles.getCompanyNamesForSymbols(allCodes);

  const resolveMember = (code: string): ChainClusterMember => {
    const listedName = nameMap.get(code);
    if (listedName !== undefined) return { code, name: listedName, isListed: true };
    const external = deps.industryReference.getExternalCompanyName(code);
    return { code, name: external?.nameZh ?? external?.nameEn ?? null, isListed: false };
  };

  return {
    clusters: clusters.map((c) => ({
      clusterId: c.clusterId,
      label: c.label,
      metaGroup: c.metaGroup,
      directMembers: c.directMemberCodes.map(resolveMember),
      subClusters: c.subClusters.map((s) => ({
        subClusterId: s.subClusterId,
        subLabel: s.subLabel,
        members: s.memberCodes.map(resolveMember),
      })),
    })),
  };
};

// 2026-09-15 應 web-nuxt「產業追蹤」頁面重建（第二次，逐層點開瀏覽樹）需求新增——
// playwright-py 重建了樹狀瀏覽結構（粗分類→產業→產業內區隔（1~3層）→公司），取代
// getIndustryChainClassification 原本給瀏覽用的扁平兩層（那支端點/資料本身沒有下線，
// company_category_summary 繼續是 findPeerGroup 同業比較跟公司「產業標籤」顯示用，
// 兩者不是取代關係，見 industryTree.ts 檔頭說明）。一次回傳整棵樹（含全部子節點跟葉
// 節點成員），成員只在葉節點出現，全部是上市櫃公司（不像 chain-clusters 含外部節點，
// 這裡不需要 isListed）。
const collectAllMemberSymbols = (nodes: IndustryChainTreeNode[]): string[] => nodes.flatMap((n) => [...n.memberSymbols, ...collectAllMemberSymbols(n.children)]);

export const getIndustryChainTree = async (deps: IndustriesDeps): Promise<IndustryChainTreeResult> => {
  const roots = deps.industryReference.listIndustryTree();
  const nameMap = await deps.companyProfiles.getCompanyNamesForSymbols(collectAllMemberSymbols(roots));

  const toResponseNode = (node: IndustryChainTreeNode): IndustryChainTreeResultNode => ({
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    label: node.label,
    depth: node.depth,
    size: node.size,
    children: node.children.map(toResponseNode),
    members: node.memberSymbols.map((symbol) => ({ symbol, companyName: nameMap.get(symbol) ?? null })),
  });

  return { roots: roots.map(toResponseNode) };
};

// 2026-09-11 應使用者要求新增——給 screener 的 industryCodes 產業篩選（見
// application/screener）取得合法代碼用，也可以單獨拿來做類股瀏覽 UI。跟上面
// GET /industries/tree 是不同分類體系（證交所類股 vs 財政部稅籍），刻意獨立端點，不合併。
export const getSecuritiesIndustrySectors = async (deps: Pick<AppDeps, 'industryReference'>): Promise<SecuritiesIndustrySectorsResult> => {
  const sectors = await deps.industryReference.listSecuritiesIndustrySectors();
  return { sectors };
};
