import { playwrightExportPrisma } from '@/infrastructure/prisma/playwrightExportClient';
import { logger } from '@/infrastructure/logger';

// 2026-09-15：playwright-py 重建的「產業追蹤」逐層點開瀏覽樹，取代
// industryChainClassification.ts 原本給 GET /industries/chain-classification 用的扁平
// 兩層（category/coarseGroup）——那份資料本身沒有消失（company_category_summary 繼續
// 存在，還是每家公司的「產業標籤」顯示用，也是 findPeerGroup 同業比較階梯的其中一層），
// 只是瀏覽樹改用這裡的新結構，兩份資料源不是取代關係。
//
// 樹狀結構：粗分類(10+其他) → 產業(33) → 產業內區隔（依「共用上下游夥伴」遞迴分群，
// 1~3層，Gemini 取名，兄弟互相區分）→ 公司。node_type 恆為 coarse_group/category/
// segment/misc 四種之一，misc 是「其他（共用上下游太少）」的長尾桶。全市場 1984 家上市
// 櫃公司都在葉節點的 members 裡（不像 industryClusters.ts 的聚落圖含外部非上市公司，
// 這裡不需要 isListed 欄位）。
//
// ⚠️ node_id 不是穩定 id——playwright-py 重建樹（報告更新/調整分群邏輯）後同一個 node_id
// 可能對應到完全不同的節點，跟 cluster_id/sub_cluster_id 同一種不穩定性質（見
// industryClusters.ts 的說明），呼叫端不能拿它當永久識別碼快取。
//
// 快取策略跟同資料夾其餘檔案一致：伺服器啟動時抓一次進記憶體，之後不重抓（除非重啟）。

export type IndustryTreeNodeType = 'coarse_group' | 'category' | 'segment' | 'misc';

export interface IndustryTreeNode {
  nodeId: string;
  nodeType: IndustryTreeNodeType;
  label: string | null;
  depth: number;
  size: number | null;
  children: IndustryTreeNode[];
  memberSymbols: string[]; // 只有葉節點（沒有 children）才有成員，其餘節點恆為 []
}

interface RawIndustryTreeNodeRow {
  node_id: string;
  parent_id: string | null;
  depth: number;
  node_type: string;
  label: string | null;
  size: number | null;
  sort_order: number | null;
}

interface RawIndustryTreeMemberRow {
  code: string;
  node_id: string;
}

interface MutableIndustryTreeNode extends IndustryTreeNode {
  parentId: string | null;
  sortOrder: number;
}

// 2026-09-15（第二次）：findPeerGroup 同業比較改用這棵樹的葉節點當第一選擇（不再用
// industryChainClassification.ts 的 33 類 category 當第一選擇，那份資料/端點沒有下線，
// 繼續當每家公司的「產業標籤」顯示用，也是這裡階梯退無可退時的參考——但比較演算法本身
// 只走這棵樹的 parent_id 鏈，不會真的退回去呼叫舊版邏輯，見下方 findPeerGroupByTree 的
// 說明）。
interface TreeNodeIndexEntry {
  nodeId: string;
  parentId: string | null;
  nodeType: IndustryTreeNodeType;
  label: string | null;
  subtreeMembers: string[]; // 這個節點（含所有子孫節點）底下全部公司代號，葉節點時就是它自己的 memberSymbols
}

let treeRootsCache: IndustryTreeNode[] | null = null;
let nodeIndexCache: Map<string, TreeNodeIndexEntry> | null = null;
let symbolToLeafNodeCache: Map<string, string> | null = null;

const fetchIndustryTreeNodesOnce = async (): Promise<RawIndustryTreeNodeRow[]> => {
  return playwrightExportPrisma.$queryRaw<RawIndustryTreeNodeRow[]>`
    SELECT node_id, parent_id, depth, node_type, label, size, sort_order FROM "export"."industry_tree_nodes"
  `;
};

const fetchIndustryTreeMembersOnce = async (): Promise<RawIndustryTreeMemberRow[]> => {
  return playwrightExportPrisma.$queryRaw<RawIndustryTreeMemberRow[]>`
    SELECT code, node_id FROM "export"."industry_tree_members"
  `;
};

const toNodeType = (value: string): IndustryTreeNodeType =>
  value === 'coarse_group' || value === 'category' || value === 'segment' || value === 'misc' ? value : 'misc';

const buildIndustryTree = (nodeRows: RawIndustryTreeNodeRow[], memberRows: RawIndustryTreeMemberRow[]): IndustryTreeNode[] => {
  const nodeMap = new Map<string, MutableIndustryTreeNode>();
  for (const row of nodeRows) {
    nodeMap.set(row.node_id, {
      nodeId: row.node_id,
      nodeType: toNodeType(row.node_type),
      label: row.label,
      depth: row.depth,
      size: row.size,
      children: [],
      memberSymbols: [],
      parentId: row.parent_id,
      sortOrder: row.sort_order ?? 0,
    });
  }

  for (const row of memberRows) {
    const node = nodeMap.get(row.node_id);
    if (node) node.memberSymbols.push(row.code); // 理論上不會查無節點（member 一定屬於某個已知葉節點），防禦性跳過
  }

  const roots: MutableIndustryTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(node.parentId);
      if (parent) parent.children.push(node); // 理論上不會查無父節點，防禦性跳過（孤兒節點就不會出現在回傳的樹裡）
    }
  }

  const sortRecursively = (nodes: MutableIndustryTreeNode[]): void => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const node of nodes) sortRecursively(node.children as MutableIndustryTreeNode[]);
  };
  sortRecursively(roots);

  return roots;
};

// 後序遍歷，把每個節點的子孫葉節點成員都彙整成 subtreeMembers（同業比較往上退時，一個
// 中間節點代表的同業池就是它底下全部葉節點成員的聯集），順便把葉節點的 symbol -> nodeId
// 反查表建起來。
const buildNodeIndex = (roots: MutableIndustryTreeNode[]): { nodeIndex: Map<string, TreeNodeIndexEntry>; symbolToLeafNode: Map<string, string> } => {
  const nodeIndex = new Map<string, TreeNodeIndexEntry>();
  const symbolToLeafNode = new Map<string, string>();

  const visit = (node: MutableIndustryTreeNode): string[] => {
    const isLeaf = node.children.length === 0;
    if (isLeaf) {
      for (const symbol of node.memberSymbols) symbolToLeafNode.set(symbol, node.nodeId);
      nodeIndex.set(node.nodeId, { nodeId: node.nodeId, parentId: node.parentId, nodeType: node.nodeType, label: node.label, subtreeMembers: node.memberSymbols });
      return node.memberSymbols;
    }
    const subtreeMembers = (node.children as MutableIndustryTreeNode[]).flatMap(visit);
    nodeIndex.set(node.nodeId, { nodeId: node.nodeId, parentId: node.parentId, nodeType: node.nodeType, label: node.label, subtreeMembers });
    return subtreeMembers;
  };

  for (const root of roots) visit(root);
  return { nodeIndex, symbolToLeafNode };
};

// 伺服器啟動時嘗試載入一次——輔助性質，失敗不擋伺服器啟動、也不重試，之後
// listIndustryTree() 自然退化成空陣列（除非重啟伺服器重新載入），跟同資料夾其餘檔案
// 一致的容錯原則。
export const loadIndustryTree = async (): Promise<void> => {
  try {
    const [nodeRows, memberRows] = await Promise.all([fetchIndustryTreeNodesOnce(), fetchIndustryTreeMembersOnce()]);
    const roots = buildIndustryTree(nodeRows, memberRows) as MutableIndustryTreeNode[];
    treeRootsCache = roots;
    const { nodeIndex, symbolToLeafNode } = buildNodeIndex(roots);
    nodeIndexCache = nodeIndex;
    symbolToLeafNodeCache = symbolToLeafNode;
    logger.info(`[industry-tree]: 已從 playwright-py 載入產業追蹤瀏覽樹（${nodeRows.length} 個節點、${memberRows.length} 家公司成員）。`);
  } catch (error) {
    logger.warn({ err: error }, '[industry-tree]: 載入失敗，不影響伺服器啟動；之後的產業瀏覽/同業比較查詢會回傳空樹/查無資料（除非重啟伺服器重新載入）。');
  }
};

// 全部頂層節點（粗分類，2026-09-15 實測 10+1 個），依 sortOrder 排序，整棵樹（含全部
// 子節點跟葉節點成員）一次回傳，不用逐層查詢。
export const listIndustryTree = (): IndustryTreeNode[] => treeRootsCache ?? [];

// ============================================================================
// 產業同業比較（2026-09-15 第二次改版，取代 industryChainClassification.ts 原本用
// 33 類 category/coarseGroup 當第一選擇的 findPeerGroup）
// ============================================================================

export interface TreePeerGroupResult {
  found: boolean;
  nodeId: string | null; // 實際用到的層級的 node_id
  nodeType: IndustryTreeNodeType | null; // 實際用到的層級（'coarse_group'|'category'|'segment'，恆不會是 'misc'——misc 桶本身不當同業池，見下方說明）
  label: string | null;
  peers: string[]; // 含目標公司自己；found=false 時是 []
  notFoundReason: 'not_classified' | 'insufficient_peers' | null; // not_classified=公司完全不在樹裡（供應鏈報告沒提到）；insufficient_peers=退到根節點（coarse_group）都湊不滿 minPeers
}

const NOT_FOUND = (reason: TreePeerGroupResult['notFoundReason']): TreePeerGroupResult => ({
  found: false,
  nodeId: null,
  nodeType: null,
  label: null,
  peers: [],
  notFoundReason: reason,
});

// 演算法（playwright-py 2026-09-15 拍板）：
// 1. 目標公司所在葉節點：排除自己後同業（candidatePool 交集）達 minPeers（含自己）就用這層。
// 2. 不夠 -> 沿 parent_id 鏈網上退（產業內區隔可能有 1~3 層，逐層退），每一層的同業池是
//    「這個節點底下全部葉節點成員的聯集」（subtreeMembers），一路退到 node_type='category'、
//    再不夠退到根節點 node_type='coarse_group'。
// 3. 例外：目標公司所在葉節點的 node_type 是 'misc'（「其他（共用上下游太少）」長尾桶）時，
//    這個桶定義上就是「看不出跟誰位置相近」，不能當同業池——直接跳過整個 misc/segment 這段，
//    從最近的 node_type='category' 祖先開始起算（不是從 misc 節點自己往上一階一階退）。
// 4. 退到根節點（coarse_group）還是不夠 minPeers，老實回傳「同業不足」（notFoundReason:
//    'insufficient_peers'），不強行湊一個低於門檻的結果——這點跟 industryChainClassification.ts
//    舊版「退到最粗層級也要回傳」的慣例不同，是 playwright-py 這次明確要求的行為。
export const findPeerGroupByTree = (symbol: string, candidatePool: ReadonlySet<string>, minPeers: number): TreePeerGroupResult => {
  if (!nodeIndexCache || !symbolToLeafNodeCache) return NOT_FOUND('not_classified');

  const leafNodeId = symbolToLeafNodeCache.get(symbol);
  if (!leafNodeId) return NOT_FOUND('not_classified');

  const leafNode = nodeIndexCache.get(leafNodeId);
  if (!leafNode) return NOT_FOUND('not_classified'); // 理論上不會發生，防禦性處理

  let startNodeId = leafNodeId;
  if (leafNode.nodeType === 'misc') {
    let cursor: TreeNodeIndexEntry | undefined = leafNode;
    while (cursor && cursor.nodeType !== 'category') {
      cursor = cursor.parentId === null ? undefined : nodeIndexCache.get(cursor.parentId);
    }
    if (!cursor) return NOT_FOUND('not_classified'); // 理論上不會發生（category 一定是某個祖先），防禦性處理
    startNodeId = cursor.nodeId;
  }

  let cursorId: string | undefined = startNodeId;
  while (cursorId) {
    const node: TreeNodeIndexEntry = nodeIndexCache.get(cursorId)!;
    const peersExcludingSelf = node.subtreeMembers.filter((s) => s !== symbol && candidatePool.has(s));
    const peers = [symbol, ...peersExcludingSelf];
    if (peers.length >= minPeers) {
      return { found: true, nodeId: node.nodeId, nodeType: node.nodeType, label: node.label, peers, notFoundReason: null };
    }
    cursorId = node.parentId ?? undefined;
  }

  return NOT_FOUND('insufficient_peers');
};
