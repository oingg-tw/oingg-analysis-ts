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

interface CompanyCategoryEntry {
  category: string | null;
  sampleSize: number;
  confidence: number | null;
  coarseGroup: string | null;
}

interface RawCompanyCategorySummaryRow {
  code: string;
  category: string | null;
  sample_size: number | string | null; // DB 是 Decimal，Prisma driver adapter 回傳字串或數字視情況而定，統一在 buildCompanyCategoryCache 轉成 number
  confidence: number | string | null;
  coarse_group: string | null;
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
    SELECT code, category, sample_size, confidence, coarse_group
    FROM "export"."company_category_summary"
  `;
};

const fetchCategoryGroupsOnce = async (): Promise<RawCategoryGroupRow[]> => {
  return playwrightExportPrisma.$queryRaw<RawCategoryGroupRow[]>`
    SELECT coarse_group, fine_category
    FROM "export"."category_groups"
  `;
};

const toNumberOrNull = (value: number | string | null): number | null => {
  if (value === null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const buildCompanyCategoryCache = (rows: RawCompanyCategorySummaryRow[]): Map<string, CompanyCategoryEntry> => {
  const map = new Map<string, CompanyCategoryEntry>();
  for (const row of rows) {
    map.set(row.code, {
      category: row.category,
      sampleSize: toNumberOrNull(row.sample_size) ?? 0,
      confidence: toNumberOrNull(row.confidence),
      coarseGroup: row.coarse_group,
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
  confidence: number | null; // 目標公司自己的信心分數（categoryCount/sampleSize），不是同業群體的統計量——新的資料品質信號，gov-ts 版本沒有
  sampleSize: number | null; // 目標公司自己已分類的供應鏈邊數量
  peers: string[]; // 含目標公司自己；found=false 時是 []
}

const NOT_FOUND: PeerGroupResult = { found: false, level: null, code: null, name: null, category: null, confidence: null, sampleSize: null, peers: [] };

export interface FindPeerGroupOptions {
  minConfidence?: number;
  minSampleSize?: number;
}

// 找同業：(1) 目標公司完全沒有分類（category===null）-> 查無資料；(2) 同細分類候選池湊到
// minPeers（含自己）-> level:'category'；(3) 不夠 -> 用粗分類找跨細分類的候選池，湊到
// minPeers -> level:'coarseGroup'；(4) 粗分類池仍不足但非空 -> 照舊版「退到最粗層級也要
// 回傳」的慣例，即使沒湊到 minPeers 也回傳這個結果；(5) 連粗分類池都是空的（理論上不會
// 發生，粗分類池至少包含目標公司自己）-> 查無資料。
//
// minConfidence/minSampleSize 是「候選同業本身的分類信不信得過」門檻——candidate 自己的
// confidence/sampleSize 沒過門檻就不列入同業池（分類本身就不可靠的公司拉進來比較會稀釋
// 整組同業的參考價值）。目標公司（symbol 自己）不受這個門檻限制：只要有分類就照常執行
// 找同業流程，回傳的 target confidence/sampleSize 讓呼叫端（controller）自己決定要不要
// 額外提醒使用者「這次比較本身信心較低」，這支函式只負責找同業、不負責決定要不要拒絕。
export const findPeerGroup = (symbol: string, candidatePool: ReadonlySet<string>, minPeers: number, options: FindPeerGroupOptions = {}): PeerGroupResult => {
  const { minConfidence = 0, minSampleSize = 0 } = options;
  if (!companyCategoryCache || !coarseGroupMembersCache) return NOT_FOUND;
  const target = companyCategoryCache.get(symbol);
  if (!target || target.category === null) return NOT_FOUND;

  const isQualifiedCandidate = (s: string): CompanyCategoryEntry | undefined => {
    const entry = companyCategoryCache!.get(s);
    if (!entry || entry.category === null) return undefined;
    if (entry.sampleSize < minSampleSize) return undefined;
    if (entry.confidence === null || entry.confidence < minConfidence) return undefined;
    return entry;
  };

  const categoryPeers = [...candidatePool].filter((s) => s !== symbol && isQualifiedCandidate(s)?.category === target.category);
  const categoryResult: PeerGroupResult = {
    found: true,
    level: 'category',
    code: target.category,
    name: target.category,
    category: target.category,
    confidence: target.confidence,
    sampleSize: target.sampleSize,
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
    confidence: target.confidence,
    sampleSize: target.sampleSize,
    peers: [symbol, ...coarseGroupPeers],
  };
  // 退到最粗層級（coarseGroup）湊到 minPeers 就回傳；湊不滿也回傳同一個結果（不繼續往上
  // 爬——粗分類已經是最粗的層級），跟 gov-ts 版本「連 division 都不足門檻也要停在
  // division」的既有慣例一致：找同業的目的是給呼叫端一個「這個信心水準下最好的分組」，
  // 不是保證一定湊滿 minPeers 家。
  return coarseGroupResult;
};
