import { govExportPrisma } from '@/adapters/prisma/govExportClient';
import { logger } from '@/shared/logger';

// 資料源是 gov-ts 的財政部稅籍行業標準分類（export.company_industry_classification +
// export.industry_codes），五層階層 section/division/group/class/subclass，每家公司最多
// 4 組代碼（rank 0=主要，1-3=次要，這裡只用 rank=0）。兩種用途，兩組獨立的查詢函式：
//
// 1. 產業同業比較（findPeerGroup）——核心問題是分類層級的「同業密度」是真正的限制：用 999
//    家已追蹤公司實測，子類層級中位數只有 1 家同業（過半是孤例），中類層級雖然保證有同業
//    但會混進不相關業務（例：健身中心在中類「運動娛樂休閒服務業」的「同業」是主題樂園、
//    KTV）。用動態層級回退解決：從子類開始比對，同業數不足門檻就往更粗一層退，直到湊足或
//    退到中類為止（不繼續往 section 爬，gov-ts 的密度分析只測到中類）。
// 2. 產業階層瀏覽（getIndustryNodeInfo/listIndustryChildren/listIndustryCompanies）——
//    純瀏覽語意（可展開的樹狀結構），不做動態回退，查無資料就是查無資料。因為每家公司一定
//    分類到 subclass 這個最細層級（5 層代碼全部非 null），「公司的某層級欄位精確等於 code」
//    天生就等於「這個 code 子樹底下的公司總數」，不需要遞迴爬子節點加總。

export type IndustryLevel = 'section' | 'division' | 'group' | 'class' | 'subclass';

// 樹狀瀏覽用的「根→葉」順序，跟下面 PEER_FALLBACK_LEVELS（葉→根、不含 section）是兩種不同
// 用途的常數，不要合併——語意不同（一個是回退順序，一個是樹的階層順序）。
const TREE_LEVELS: IndustryLevel[] = ['section', 'division', 'group', 'class', 'subclass'];
const PEER_FALLBACK_LEVELS: IndustryLevel[] = ['subclass', 'class', 'group', 'division'];

interface CompanyClassification {
  section: string | null;
  division: string | null;
  group: string | null;
  class: string | null;
  subclass: string | null;
}

interface RawClassificationRow {
  symbol: string;
  section_code: string | null;
  division_code: string | null;
  group_code: string | null;
  class_code: string | null;
  subclass_code: string | null;
}

interface RawIndustryCodeRow {
  code: string;
  level: string;
  section_code: string | null;
  division_code: string | null;
  group_code: string | null;
  class_code: string | null;
  subclass_code: string | null;
  name_zh: string | null;
}

interface IndustryTreeNode {
  code: string;
  level: IndustryLevel;
  name: string | null;
  parentCode: string | null; // null = 這是 section（樹根的直屬子節點）
  childCodes: string[]; // 依 code 字串排序，穩定順序
}

let classificationCache: Map<string, CompanyClassification> | null = null;
let industryNameCache: Map<string, string> | null = null;
let industryTreeCache: Map<string, IndustryTreeNode> | null = null; // key = code，2466 筆全收
let industryTreeRootCodes: string[] | null = null; // 19 個 section code，已排序
let companyCountCache: Map<string, number> | null = null; // key = code，這個 code 子樹底下總公司數

const fetchClassificationOnce = async (): Promise<Map<string, CompanyClassification>> => {
  const rows = await govExportPrisma.$queryRaw<RawClassificationRow[]>`
    SELECT symbol, section_code, division_code, group_code, class_code, subclass_code
    FROM "export"."company_industry_classification"
    WHERE rank = 0 AND symbol IS NOT NULL
  `;
  const map = new Map<string, CompanyClassification>();
  for (const row of rows) {
    map.set(row.symbol, {
      section: row.section_code,
      division: row.division_code,
      group: row.group_code,
      class: row.class_code,
      subclass: row.subclass_code,
    });
  }
  return map;
};

// code 欄位查詢不需要額外帶 level 當複合鍵——已對真實資料內省過（2026-09-05），各層代碼
// 格式天生不會互撞（section 單一字母、division 兩位數字、group 三位數字、class 四位數字、
// subclass 四位數字+dash+兩位數字），見 prisma/govExport/schema.prisma 的 TaxIndustryCode 說明。
const fetchIndustryCodesOnce = async (): Promise<RawIndustryCodeRow[]> => {
  return govExportPrisma.$queryRaw<RawIndustryCodeRow[]>`
    SELECT code, level, section_code, division_code, group_code, class_code, subclass_code, name_zh
    FROM "export"."industry_codes"
    WHERE code IS NOT NULL AND level IS NOT NULL
  `;
};

const isIndustryLevel = (level: string): level is IndustryLevel =>
  (TREE_LEVELS as string[]).includes(level);

// section 列自己的 section_code 欄位值就等於自己的 code——不能天真地「依 level 對照到
// 對應欄位」當 parent，那樣會誤把 section 的 parent 設成自己、造成自我循環，一定要特別
// 處理成 null（樹根）。
const parentCodeOf = (row: RawIndustryCodeRow): string | null => {
  switch (row.level) {
    case 'section':
      return null;
    case 'division':
      return row.section_code;
    case 'group':
      return row.division_code;
    case 'class':
      return row.group_code;
    case 'subclass':
      return row.class_code;
    default:
      return null;
  }
};

const buildIndustryTree = (rows: RawIndustryCodeRow[]): { tree: Map<string, IndustryTreeNode>; rootCodes: string[] } => {
  const tree = new Map<string, IndustryTreeNode>();
  const childrenByParent = new Map<string | null, string[]>();

  for (const row of rows) {
    if (!isIndustryLevel(row.level)) continue;
    const parentCode = parentCodeOf(row);
    tree.set(row.code, { code: row.code, level: row.level, name: row.name_zh, parentCode, childCodes: [] });
    const siblings = childrenByParent.get(parentCode) ?? [];
    siblings.push(row.code);
    childrenByParent.set(parentCode, siblings);
  }

  for (const [parentCode, childCodes] of childrenByParent) {
    childCodes.sort();
    if (parentCode === null) continue;
    const parentNode = tree.get(parentCode);
    if (parentNode) parentNode.childCodes = childCodes;
  }

  return { tree, rootCodes: (childrenByParent.get(null) ?? []).sort() };
};

const buildNameCache = (rows: RawIndustryCodeRow[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.name_zh) map.set(row.code, row.name_zh);
  }
  return map;
};

// 啟動時算好（O(999x5)，不做 request-time 重算）：每家公司的 5 層代碼各自計數，因為每家
// 公司都分類到 subclass 最細層級，這個計數天生就是「這個 code 子樹底下總公司數」，不需要
// 遞迴爬子節點加總。
const buildCompanyCountCache = (classification: Map<string, CompanyClassification>, tree: Map<string, IndustryTreeNode>): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const code of tree.keys()) counts.set(code, 0);
  for (const entry of classification.values()) {
    for (const level of TREE_LEVELS) {
      const code = entry[level];
      if (code !== null) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return counts;
};

// 伺服器啟動時嘗試載入一次——輔助性質，失敗不擋伺服器啟動、也不重試，之後查詢自然退化成
// 「查無分類資料」。這是記憶體快取，**不落地存 DB 副本**——2026-09-04 使用者已經明確否決
// 「curated 中台層」這個方向（曾經蓋過又完整回退），這裡刻意不重蹈覆轍，也不需要：分類
// 資料是輔助查詢用途，開天窗的代價只是這些功能暫時查不到，可接受。只在啟動時抓一次，之後
// 不主動重抓，除非重啟伺服器——分類資料變動慢，先不做定期刷新排程。
export const loadIndustryClassification = async (): Promise<void> => {
  try {
    const [classification, codeRows] = await Promise.all([fetchClassificationOnce(), fetchIndustryCodesOnce()]);
    classificationCache = classification;
    industryNameCache = buildNameCache(codeRows);
    const { tree, rootCodes } = buildIndustryTree(codeRows);
    industryTreeCache = tree;
    industryTreeRootCodes = rootCodes;
    companyCountCache = buildCompanyCountCache(classification, tree);
    logger.info(`[industry-classification]: 已從 gov-ts 載入產業分類（${classification.size} 家公司）、代碼字典（${codeRows.length} 筆）、階層樹（${rootCodes.length} 個 section）。`);
  } catch (error) {
    logger.warn({ err: error }, '[industry-classification]: 載入失敗，不影響伺服器啟動；之後的同業比較/產業瀏覽查詢會回傳查無資料（除非重啟伺服器重新載入）。');
  }
};

// ============================================================================
// 產業同業比較
// ============================================================================

export interface PeerGroupResult {
  found: boolean;
  level: IndustryLevel | null;
  code: string | null;
  name: string | null;
  peers: string[]; // 含目標公司自己；found=false 時是 []
}

const NOT_FOUND: PeerGroupResult = { found: false, level: null, code: null, name: null, peers: [] };

// 動態層級回退：子類(subclass)→細類(class)→小類(group)→中類(division)，同業數（含自己）
// 達到 minPeers 就停在該層；連 division 都不足門檻仍然停在 division（不繼續往 section
// 爬），即使那樣同業數可能不足。純讀記憶體快取，同步函式，不用 await。
export const findPeerGroup = (symbol: string, candidatePool: ReadonlySet<string>, minPeers: number): PeerGroupResult => {
  if (!classificationCache || !industryNameCache) return NOT_FOUND;
  const target = classificationCache.get(symbol);
  if (!target) return NOT_FOUND;

  let divisionFallback: PeerGroupResult | null = null;
  for (const level of PEER_FALLBACK_LEVELS) {
    const code = target[level];
    if (code === null) continue;

    const peers = [...candidatePool].filter((s) => s !== symbol && classificationCache!.get(s)?.[level] === code);
    const result: PeerGroupResult = { found: true, level, code, name: industryNameCache.get(code) ?? null, peers: [symbol, ...peers] };
    if (level === 'division') divisionFallback = result;
    if (result.peers.length >= minPeers) return result;
  }

  return divisionFallback ?? NOT_FOUND; // 連 division 代碼都沒有 -> 真的沒有分類資料可比
};

// ============================================================================
// 產業階層瀏覽（可展開的樹狀結構，不做動態回退）
// ============================================================================

export interface IndustryNodeInfo {
  code: string | null; // null = 樹根
  level: IndustryLevel | null;
  name: string | null;
  companyCount: number; // 含所有子孫節點的公司數加總
}

export interface IndustryTreeChildSummary {
  code: string;
  level: IndustryLevel;
  name: string | null;
  companyCount: number;
  hasChildren: boolean; // subclass 層級一律是 false
}

// 查一個 code 本身的 metadata。code=null 代表樹根，一定回傳成功（companyCount 用
// classificationCache.size，不是 companyCountCache 加總——更直接、保證跟「999 家」的口徑
// 一致）。code 給了但字典查無此代碼 -> 回傳 null，controller 依此判斷 found:false。
export const getIndustryNodeInfo = (code: string | null): IndustryNodeInfo | null => {
  if (code === null) return { code: null, level: null, name: null, companyCount: classificationCache?.size ?? 0 };
  const node = industryTreeCache?.get(code);
  if (!node) return null;
  return { code: node.code, level: node.level, name: node.name, companyCount: companyCountCache?.get(node.code) ?? 0 };
};

// 直屬子節點清單。code=null 回傳 19 個 section；code 是 subclass 或查無此代碼一律回傳
// []（跟 findPeerGroup 不同，這裡刻意不做回退，查無此代碼就是空清單）。
export const listIndustryChildren = (code: string | null): IndustryTreeChildSummary[] => {
  const childCodes = code === null ? (industryTreeRootCodes ?? []) : (industryTreeCache?.get(code)?.childCodes ?? []);
  return childCodes
    .map((childCode) => industryTreeCache?.get(childCode))
    .filter((node): node is IndustryTreeNode => node !== undefined)
    .map((node) => ({
      code: node.code,
      level: node.level,
      name: node.name,
      companyCount: companyCountCache?.get(node.code) ?? 0,
      hasChildren: node.childCodes.length > 0,
    }));
};

// 精確符合這個 code 的公司清單——不做動態回退，這點跟 findPeerGroup 是兩種不同語意的查詢，
// 刻意分開成獨立函式。因為每家公司一定分類到 subclass 這個最細層級，非 subclass 層級的
// 「精確符合」永遠是空集合，這裡直接反映這個事實，不是 bug（呼叫端要看子孫加總請用
// getIndustryNodeInfo/listIndustryChildren 的 companyCount）。
export const listIndustryCompanies = (code: string): string[] => {
  const node = industryTreeCache?.get(code);
  if (!node || node.level !== 'subclass' || !classificationCache) return [];
  const symbols: string[] = [];
  for (const [symbol, entry] of classificationCache) {
    if (entry.subclass === code) symbols.push(symbol);
  }
  return symbols;
};
