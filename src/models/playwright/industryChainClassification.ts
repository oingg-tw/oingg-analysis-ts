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
// 產業瀏覽（批次匯出，給「產業追蹤」頁面重建用，2026-09-14 web-nuxt 要求）
// ============================================================================
//
// 2026-09-15（第二次）：同業比較（原本這裡的 findPeerGroup）已搬到
// src/models/playwright/industryTree.ts 的 findPeerGroupByTree，改用產業追蹤樹的葉節點
// 當第一選擇，不再用這裡的 33 類 category 當第一選擇——這份檔案的 companyCategoryCache/
// coarseGroupMembersCache 現在純粹是「產業標籤」顯示用途（見下方 getCompanyCategoryInfo/
// listAllCompanyCategories），不再是同業比較演算法本身的資料源，舊版 findPeerGroup 已
// 直接刪除，不留 fallback。

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

// 2026-09-15（第二次）：findPeerGroup 同業比較改用 industryTree.ts 的樹狀結構找同業，
// 這裡的 category/coarseGroup/source 不再是同業比較演算法本身的一部分，但仍然是每家
// 公司的「產業標籤」顯示用途（見檔頭說明）——給 GET /companies/peer-group 之類需要
// 「同時顯示同業結果 + 這家公司的產業標籤」的呼叫端用，不用整份 listAllCompanyCategories()
// 只為了查一家公司。
export const getCompanyCategoryInfo = (symbol: string): CompanyCategoryEntry | undefined => companyCategoryCache?.get(symbol);
