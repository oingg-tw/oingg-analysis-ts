import { playwrightExportPrisma } from '@/adapters/prisma/playwrightExportClient';
import { logger } from '@/shared/logger';

// 2026-09-14：給重建版「產業追蹤」頁面的 drill-down 樹用——playwright-py 的供應鏈聚落分群
// （人工中文標籤，不是 Gemini 生成），跟同資料夾 industryChainClassification.ts 的
// category/coarseGroup（扁平 2 層、33→10）是完全獨立的另一套分群概念：聚落是真正的階層
// 結構，不是 category_hierarchy 那套「供應鏈上下游 tiers」，也不是 coarseGroup 那種業務
// 相似度分組。2026-09-14 當天演算法整個重做過一次（原本 Louvain 社群偵測「單次切+事後
// 補丁式細分」113 頂層+475 子聚落，改成「由下而上的 dendrogram 分層」124 頂層+278
// 子聚落，這次新演算法下實測每個頂層聚落底下都有子聚落）——分群方法本身可能還會再調整，
// directMemberCodes 是不是恆為空陣列不要當成假設寫死，程式邏輯要能同時處理「有/沒有
// 子聚落」兩種情況（見下方 ClusterNode 的說明）。
//
// ⚠️ cluster_id/sub_cluster_id 不是穩定 id——playwright-py 重跑 build_industry_chain
// （報告更新/圖重建，或像 2026-09-14 這次直接換分群演算法）後重新分群，同一個 cluster_id
// 可能對應到完全不同的一群公司，號碼會整個洗牌。呼叫端（controller/前端）不能把它當
// 永久不變的產業分類代碼快取/收藏/放進分享連結，只能當「這次查詢當下的聚落」用。
// playwright-py 承諾重新分群時會主動通知，屆時只需要重啟服務重新載入快取，不需要改
// 程式碼（2026-09-14 當天已經實際發生過一次，流程驗證過可行）。
//
// 供應鏈圖節點不是只有台股上市櫃公司——7,566 個節點裡只有 1,912 個是上市櫃公司，其餘
// 5,654 個是外部/非上市公司（蘋果/Nvidia/ASML 這類，用公司名稱生成的穩定 id 不是股票
// 代號），使用者已拍板兩種都收，讓聚落樹能看到完整供應鏈脈絡。外部公司的名稱來自
// ExternalCompany view（見 fetchExternalCompaniesOnce），不是 twse/tpex company_profile
// ——controller 層要兩邊都查，查不到 company_profile 的再查這裡。
//
// 快取策略跟 industryChainClassification.ts 一致：伺服器啟動時抓一次進記憶體，之後不重抓
// （除非重啟），見該檔案的說明。
//
// 2026-09-15：playwright-py 在 export.industry_cluster_members 加了 meta_group 欄位——
// 細聚落再收斂成更粗的「元分組」，跟 industryChainClassification.ts 的 coarseGroup
// 是同一種「細分類太多、再包一層粗分類方便瀏覽」的設計精神，但這裡是聚落層級不是
// category 層級，兩者不要混淆。兩邊的組數/群數都會隨資料源持續調整，不要寫死數字。
// 同一個 cluster_id 底下所有 member 列的 meta_group 恆一致（已實測 0 個聚落有分歧），
// 所以視為 ClusterNode 的欄位而非 member 層級屬性。

export interface ClusterSubGroup {
  subClusterId: number;
  subLabel: string | null;
  memberCodes: string[];
}

export interface ClusterNode {
  clusterId: number;
  label: string | null;
  metaGroup: string | null; // 細聚落收斂成的粗分組，見上方 2026-09-15 說明；組數會隨資料源調整持續變動
  directMemberCodes: string[]; // 沒有再切子聚落的直屬成員；是不是恆為空陣列取決於當下的分群演算法（見檔頭說明），不要假設一定有/一定沒有
  subClusters: ClusterSubGroup[];
}

interface RawIndustryClusterRow {
  cluster_id: number;
  label: string | null;
}

interface RawIndustryClusterMemberRow {
  code: string;
  cluster_id: number;
  meta_group: string | null;
  sub_cluster_id: number | null;
  sub_label: string | null;
}

interface RawExternalCompanyRow {
  id: string;
  name_zh: string | null;
  name_en: string | null;
}

export interface ExternalCompanyEntry {
  nameZh: string | null;
  nameEn: string | null;
}

let clusterNodeCache: Map<number, ClusterNode> | null = null;
let externalCompanyCache: Map<string, ExternalCompanyEntry> | null = null;

const fetchIndustryClustersOnce = async (): Promise<RawIndustryClusterRow[]> => {
  return playwrightExportPrisma.$queryRaw<RawIndustryClusterRow[]>`
    SELECT cluster_id, label FROM "export"."industry_clusters"
  `;
};

const fetchIndustryClusterMembersOnce = async (): Promise<RawIndustryClusterMemberRow[]> => {
  return playwrightExportPrisma.$queryRaw<RawIndustryClusterMemberRow[]>`
    SELECT code, cluster_id, meta_group, sub_cluster_id, sub_label FROM "export"."industry_cluster_members"
  `;
};

const fetchExternalCompaniesOnce = async (): Promise<RawExternalCompanyRow[]> => {
  return playwrightExportPrisma.$queryRaw<RawExternalCompanyRow[]>`
    SELECT id, name_zh, name_en FROM "export"."external_companies"
  `;
};

const buildClusterNodeCache = (clusterRows: RawIndustryClusterRow[], memberRows: RawIndustryClusterMemberRow[]): Map<number, ClusterNode> => {
  const map = new Map<number, ClusterNode>();
  for (const row of clusterRows) {
    map.set(row.cluster_id, { clusterId: row.cluster_id, label: row.label, metaGroup: null, directMemberCodes: [], subClusters: [] });
  }

  const subClusterByKey = new Map<string, ClusterSubGroup>();
  for (const row of memberRows) {
    const node = map.get(row.cluster_id);
    if (!node) continue; // 理論上不會發生（member 一定屬於某個已知的頂層聚落），防禦性跳過

    if (node.metaGroup === null) node.metaGroup = row.meta_group; // 同一聚落底下每列 meta_group 恆一致，取第一筆即可

    if (row.sub_cluster_id === null) {
      node.directMemberCodes.push(row.code);
      continue;
    }

    const key = `${row.cluster_id}:${row.sub_cluster_id}`;
    let subGroup = subClusterByKey.get(key);
    if (!subGroup) {
      subGroup = { subClusterId: row.sub_cluster_id, subLabel: row.sub_label, memberCodes: [] };
      subClusterByKey.set(key, subGroup);
      node.subClusters.push(subGroup);
    }
    subGroup.memberCodes.push(row.code);
  }

  return map;
};

const buildExternalCompanyCache = (rows: RawExternalCompanyRow[]): Map<string, ExternalCompanyEntry> => {
  const map = new Map<string, ExternalCompanyEntry>();
  for (const row of rows) map.set(row.id, { nameZh: row.name_zh, nameEn: row.name_en });
  return map;
};

// 伺服器啟動時嘗試載入一次——輔助性質，失敗不擋伺服器啟動、也不重試，之後
// listIndustryClusters()/getExternalCompanyName() 自然退化成空結果，見
// industryChainClassification.ts 的 loadIndustryChainClassification() 同一種容錯原則。
export const loadIndustryClusters = async (): Promise<void> => {
  try {
    const [clusterRows, memberRows, externalRows] = await Promise.all([
      fetchIndustryClustersOnce(),
      fetchIndustryClusterMembersOnce(),
      fetchExternalCompaniesOnce(),
    ]);
    clusterNodeCache = buildClusterNodeCache(clusterRows, memberRows);
    externalCompanyCache = buildExternalCompanyCache(externalRows);
    logger.info(`[industry-clusters]: 已從 playwright-py 載入供應鏈聚落（${clusterRows.length} 個頂層聚落、${memberRows.length} 筆成員）、外部公司名稱對照（${externalRows.length} 筆）。`);
  } catch (error) {
    logger.warn({ err: error }, '[industry-clusters]: 載入失敗，不影響伺服器啟動；之後的聚落瀏覽查詢會回傳空結果（除非重啟伺服器重新載入）。');
  }
};

// 全部頂層聚落（2026-09-14 實測 124 個），依 clusterId 排序（穩定順序，不代表任何業務意義，純粹方便呼叫端
// 每次拿到一致的陣列順序）。
export const listIndustryClusters = (): ClusterNode[] => {
  if (!clusterNodeCache) return [];
  return [...clusterNodeCache.values()].sort((a, b) => a.clusterId - b.clusterId);
};

export const getExternalCompanyName = (code: string): ExternalCompanyEntry | undefined => externalCompanyCache?.get(code);
