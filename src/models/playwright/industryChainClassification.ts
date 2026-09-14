import { playwrightExportPrisma } from '@/adapters/prisma/playwrightExportClient';
import { logger } from '@/shared/logger';

// 2026-09-14：GET /companies/peer-group（findPeerGroup）的資料源，從 gov-ts 財政部稅籍
// 行業標準分類換成 oingg-playwright-py 的供應鏈分類（industry_chain，Gemini 解析真實供應
// 關係得出的 product_category，不是稅籍登記）。獨立成一支新檔案，不是直接改
// industryClassification.ts——那份檔案的 5 層階層（section/division/group/class/
// subclass）繼續撐 GET /industries/tree、/industries/flat 的樹狀瀏覽功能跟
// getCompanySectionCode（判斷「是不是製造業」），playwright-py 的分類是扁平 2 層
// （細分類/粗分類），沒有對應的遞迴樹狀結構，兩邊刻意不合併，各自服務各自的用途。
//
// 分類形狀：33 個「細分類」（category，供應鏈邊的眾數分類）→ 10 個「粗分類」
// （coarseGroup，playwright-py 自己設計的業務相似度分組，跟供應鏈上下游方向無關，不是
// category_hierarchy 那套 tiers，也不是套用 TWSE 官方 37 類——2026-09-14 使用者明確
// 否決套用 TWSE 分類）。找同業時先試細分類，不夠退到粗分類，兩層都不夠就查無同業——
// 沒有 gov-ts 版本那種 4 層動態回退，這是資料源天生的形狀差異，不是簡化。
//
// 快取策略跟 industryClassification.ts 一致：伺服器啟動時抓一次進記憶體，之後不重抓
// （除非重啟）——playwright-py 的分類資料這段期間變動比 gov-ts 稅籍分類活躍得多，但
// 2026-09-14 使用者決定沿用既有「啟動時抓一次」模式，不新增排程機制（這個服務目前沒有
// 任何 export.* 資料源有定期重抓的先例，見 loadIndustryClassification/loadIndustryCodes）。
//
// 2026-09-15 架構調整——playwright-py 把「拿供應鏈邊的 product_category 眾數投票猜公司
// 分類」整個換掉，改成「直接對公司本身分類」（讀 company_research 報告的「中游」段落，
// 一家公司一次判斷，不靠邊的數量投票）：company_category_summary 拿掉 category_count/
// sample_size/confidence 這組「邊投票可信度」欄位，換成 source（'keyword'|'gemini'，
// 先跑免費關鍵字規則 97.2% 覆蓋，再跑 Gemini 全量驗證/修正 89.2% 覆蓋，'gemini' 代表
// 有被驗證過）。這是破壞性變更，不是加欄位——findPeerGroup 原本用 confidence/sampleSize
// 當候選同業的品質門檻，現在改用 source（見下方 FindPeerGroupOptions 的
// requireVerifiedSource），confidence/sampleSize 這組概念在新架構下不存在對應物，
// PeerGroupResult 已移除這兩個欄位。

interface CompanyCategoryEntry {
  category: string | null;
  source: 'keyword' | 'gemini' | null;
  coarseGroup: string | null;
  updatedAt: Date | null; // 這家公司分類最後一次變動的時間（company_category_summary 的 updated_at）——不是「快取抓取時間」，是資料本身的新鮮度
}

interface RawCompanyCategorySummaryRow {
  code: string;
  category: string | null;
  source: string | null;
  coarse_group: string | null;
  updated_at: Date | null;
}

interface RawCategoryGroupRow {
  coarse_group: string;
  fine_category: string;
}

let companyCategoryCache: Map<string, CompanyCategoryEntry> | null = null;
// 粗分類 -> 該粗分類底下全部細分類的集合，找同業回退時用來判斷「candidate 的細分類是否
// 跟目標公司同一個粗分類」。
let coarseGroupMembersCache: Map<string, Set<string>> | null = null;

const fetchCompanyCategorySummaryOnce = async (): Promise<RawCompanyCategorySummaryRow[]> => {
  return playwrightExportPrisma.$queryRaw<RawCompanyCategorySummaryRow[]>`
    SELECT code, category, source, coarse_group, updated_at
    FROM "export"."company_category_summary"
  `;
};

const fetchCategoryGroupsOnce = async (): Promise<RawCategoryGroupRow[]> => {
  return playwrightExportPrisma.$queryRaw<RawCategoryGroupRow[]>`
    SELECT coarse_group, fine_category
    FROM "export"."category_groups"
  `;
};

const toSourceOrNull = (value: string | null): 'keyword' | 'gemini' | null => (value === 'keyword' || value === 'gemini' ? value : null);

const buildCompanyCategoryCache = (rows: RawCompanyCategorySummaryRow[]): Map<string, CompanyCategoryEntry> => {
  const map = new Map<string, CompanyCategoryEntry>();
  for (const row of rows) {
    map.set(row.code, {
      category: row.category,
      source: toSourceOrNull(row.source),
      coarseGroup: row.coarse_group,
      updatedAt: row.updated_at,
    });
  }
  return map;
};

const buildCoarseGroupMembersCache = (rows: RawCategoryGroupRow[]): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = map.get(row.coarse_group) ?? new Set<string>();
    set.add(row.fine_category);
    map.set(row.coarse_group, set);
  }
  return map;
};

// 伺服器啟動時嘗試載入一次——輔助性質，失敗不擋伺服器啟動、也不重試，之後 findPeerGroup
// 自然退化成「查無分類資料」。這是記憶體快取，不落地存 DB 副本，跟 industryClassification.ts
// 的 loadIndustryClassification() 同一種容錯原則，見該檔案的說明。
export const loadIndustryChainClassification = async (): Promise<void> => {
  try {
    const [summaryRows, groupRows] = await Promise.all([fetchCompanyCategorySummaryOnce(), fetchCategoryGroupsOnce()]);
    companyCategoryCache = buildCompanyCategoryCache(summaryRows);
    coarseGroupMembersCache = buildCoarseGroupMembersCache(groupRows);
    logger.info(`[industry-chain-classification]: 已從 playwright-py 載入供應鏈分類（${summaryRows.length} 家公司）、粗分類對照表（${groupRows.length} 筆 membership）。`);
  } catch (error) {
    logger.warn({ err: error }, '[industry-chain-classification]: 載入失敗，不影響伺服器啟動；之後的同業比較查詢會回傳查無資料（除非重啟伺服器重新載入）。');
  }
};

// ============================================================================
// 產業同業比較（取代 industryClassification.ts 原本的 gov-ts 版 findPeerGroup）
// ============================================================================

export interface PeerGroupResult {
  found: boolean;
  level: 'category' | 'coarseGroup' | null;
  code: string | null; // 這次比較實際用的層級的代碼（level:'category' 時是細分類，level:'coarseGroup' 時是粗分類）
  name: string | null;
  category: string | null; // 目標公司自己的細分類，不受 level 影響——level:'coarseGroup' 時用來告訴呼叫端「原本是哪個細分類同業不足」，跟 code 是兩個不同語意的欄位，不要合併
  source: 'keyword' | 'gemini' | null; // 目標公司分類的判斷來源，2026-09-15 取代原本的 confidence/sampleSize（見檔頭說明）——純資訊性欄位，不用來過濾候選同業（見下方 findPeerGroup 的說明）
  updatedAt: Date | null; // 目標公司分類最後一次變動的時間，不是快取抓取時間——資料本身可能比伺服器啟動時間更舊（快取只在啟動時抓一次，見檔頭說明）
  peers: string[]; // 含目標公司自己；found=false 時是 []
}

const NOT_FOUND: PeerGroupResult = { found: false, level: null, code: null, name: null, category: null, source: null, updatedAt: null, peers: [] };

// 2026-09-15：原本這裡有 FindPeerGroupOptions（minConfidence/minSampleSize）用來過濾候選
// 同業本身的分類信不信得過，資料源換掉 confidence/sampleSize 概念後，跟 playwright-py
// 確認過：新架構下 source='keyword'（代表 Gemini 完全沒看過這家公司）全市場只剩 18 家
// （<1%，1966/1984 家都是 source='gemini'），對方建議不用特別做「只收 gemini 驗證過」
// 的篩選機制，母體太小不值得增加複雜度。故意不用一個新的 requireVerifiedSource 之類的
// 參數取代，直接跟著建議拿掉整個品質門檻概念——找同業只看 category 是否相符，source
// 只當純資訊性欄位回傳給呼叫端參考。
//
// 找同業：(1) 目標公司完全沒有分類（category===null）-> 查無資料；(2) 同細分類候選池湊到
// minPeers（含自己）-> level:'category'；(3) 不夠 -> 用粗分類找跨細分類的候選池，湊到
// minPeers -> level:'coarseGroup'；(4) 粗分類池仍不足但非空 -> 照舊版「退到最粗層級也要
// 回傳」的慣例，即使沒湊到 minPeers 也回傳這個結果；(5) 連粗分類池都是空的（理論上不會
// 發生，粗分類池至少包含目標公司自己）-> 查無資料。
export const findPeerGroup = (symbol: string, candidatePool: ReadonlySet<string>, minPeers: number): PeerGroupResult => {
  if (!companyCategoryCache || !coarseGroupMembersCache) return NOT_FOUND;
  const target = companyCategoryCache.get(symbol);
  if (!target || target.category === null) return NOT_FOUND;

  const isQualifiedCandidate = (s: string): CompanyCategoryEntry | undefined => {
    const entry = companyCategoryCache!.get(s);
    if (!entry || entry.category === null) return undefined;
    return entry;
  };

  const categoryPeers = [...candidatePool].filter((s) => s !== symbol && isQualifiedCandidate(s)?.category === target.category);
  const categoryResult: PeerGroupResult = {
    found: true,
    level: 'category',
    code: target.category,
    name: target.category,
    category: target.category,
    source: target.source,
    updatedAt: target.updatedAt,
    peers: [symbol, ...categoryPeers],
  };
  if (categoryResult.peers.length >= minPeers) return categoryResult;

  // 理論上不會發生（33 細分類全部都有對應的粗分類），防禦性處理：查無粗分類對照就停在
  // 細分類層級的結果（即使沒湊到 minPeers），跟下面「退到最粗層級也要回傳」同一個慣例。
  if (target.coarseGroup === null) return categoryResult;

  const coarseGroupCategories = coarseGroupMembersCache.get(target.coarseGroup);
  const coarseGroupPeers = [...candidatePool].filter((s) => {
    if (s === symbol) return false;
    const candidateCategory = isQualifiedCandidate(s)?.category;
    if (candidateCategory === undefined || candidateCategory === null) return false;
    return coarseGroupCategories?.has(candidateCategory) ?? false;
  });
  const coarseGroupResult: PeerGroupResult = {
    found: true,
    level: 'coarseGroup',
    code: target.coarseGroup,
    name: target.coarseGroup,
    category: target.category,
    source: target.source,
    updatedAt: target.updatedAt,
    peers: [symbol, ...coarseGroupPeers],
  };
  // 退到最粗層級（coarseGroup）湊到 minPeers 就回傳；湊不滿也回傳同一個結果（不繼續往上
  // 爬——粗分類已經是最粗的層級），跟 gov-ts 版本「連 division 都不足門檻也要停在
  // division」的既有慣例一致：找同業的目的是給呼叫端一個「這個信心水準下最好的分組」，
  // 不是保證一定湊滿 minPeers 家。
  return coarseGroupResult;
};

// ============================================================================
// 產業瀏覽（批次匯出，給「產業追蹤」頁面重建用，2026-09-14 web-nuxt 要求）
// ============================================================================

export interface CompanyCategoryListEntry {
  symbol: string;
  category: string | null;
  coarseGroup: string | null;
  source: 'keyword' | 'gemini' | null;
  updatedAt: Date | null;
}

// 一次回傳全部公司的分類（含 category=null 那些，不濾掉——呼叫端自己判斷要不要顯示
// 「未分類」），比照 industryClassification.ts 的 listAllCompanyIndustryPaths() 同一種
// 「純讀記憶體快取、一次匯出、前端自建索引」精神，取代舊版樹狀瀏覽用的
// GET /industries/flat（那支是 gov-ts 稅籍分類專用，這裡是 playwright-py 供應鏈分類的
// 對應物，兩支刻意分開，不合併）。
export const listAllCompanyCategories = (): CompanyCategoryListEntry[] => {
  if (!companyCategoryCache) return [];
  return [...companyCategoryCache.entries()].map(([symbol, entry]) => ({
    symbol,
    category: entry.category,
    coarseGroup: entry.coarseGroup,
    source: entry.source,
    updatedAt: entry.updatedAt,
  }));
};

export interface CategoryGroupListEntry {
  coarseGroup: string;
  fineCategories: string[];
}

// 10 組粗分類 -> 底下細分類清單，給前端做 drill-down（粗分類 -> 細分類 -> 公司）用，
// 不用自己從 listAllCompanyCategories() 的結果反推分組關係。
export const listCategoryGroups = (): CategoryGroupListEntry[] => {
  if (!coarseGroupMembersCache) return [];
  return [...coarseGroupMembersCache.entries()]
    .map(([coarseGroup, fineCategories]) => ({ coarseGroup, fineCategories: [...fineCategories].sort() }))
    .sort((a, b) => a.coarseGroup.localeCompare(b.coarseGroup));
};
