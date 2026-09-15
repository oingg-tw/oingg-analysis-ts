import { playwrightExportPrisma } from '@/adapters/prisma/playwrightExportClient';
import { logger } from '@/shared/logger';

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

let treeRootsCache: IndustryTreeNode[] | null = null;

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

// 伺服器啟動時嘗試載入一次——輔助性質，失敗不擋伺服器啟動、也不重試，之後
// listIndustryTree() 自然退化成空陣列（除非重啟伺服器重新載入），跟同資料夾其餘檔案
// 一致的容錯原則。
export const loadIndustryTree = async (): Promise<void> => {
  try {
    const [nodeRows, memberRows] = await Promise.all([fetchIndustryTreeNodesOnce(), fetchIndustryTreeMembersOnce()]);
    treeRootsCache = buildIndustryTree(nodeRows, memberRows);
    logger.info(`[industry-tree]: 已從 playwright-py 載入產業追蹤瀏覽樹（${nodeRows.length} 個節點、${memberRows.length} 家公司成員）。`);
  } catch (error) {
    logger.warn({ err: error }, '[industry-tree]: 載入失敗，不影響伺服器啟動；之後的產業瀏覽查詢會回傳空樹（除非重啟伺服器重新載入）。');
  }
};

// 全部頂層節點（粗分類，2026-09-15 實測 10+1 個），依 sortOrder 排序，整棵樹（含全部
// 子節點跟葉節點成員）一次回傳，不用逐層查詢。
export const listIndustryTree = (): IndustryTreeNode[] => treeRootsCache ?? [];
