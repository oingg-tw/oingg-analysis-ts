import { z } from 'zod';

// 2026-09-05 新增——「產業追蹤」樹狀階層瀏覽功能，見
// src/models/gov/industryClassification.ts 的說明。

export const industryLevelSchema = z.enum(['section', 'division', 'group', 'class', 'subclass']);

export const industryTreeChildSchema = z.object({
  code: z.string(),
  level: industryLevelSchema,
  name: z.string().nullable(),
  companyCount: z.number().meta({ description: '這個子節點（含所有子孫節點）底下總共幾家公司' }),
  hasChildren: z.boolean().meta({ description: 'subclass 層級一律是 false（沒有更細的層級）' }),
});

export const industryCompanyEntrySchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
});

export const industryPathNodeSchema = z.object({
  code: z.string(),
  level: industryLevelSchema,
  name: z.string().nullable(),
});

export const industryFlatCompanySchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  path: z.array(industryPathNodeSchema).meta({ description: '由粗到細排序：section -> division -> group -> class -> subclass' }),
});

export const industryFlatResultSchema = z.object({
  companies: z.array(industryFlatCompanySchema),
});
export type IndustryFlatResult = z.infer<typeof industryFlatResultSchema>;

export const industryTreeNodeResultSchema = z.object({
  found: z.boolean().meta({ description: 'false 代表帶了 code 但查無此產業分類代碼；不給 code（查樹根）恆為 true' }),
  code: z.string().nullable().meta({ description: 'null 代表這是樹根（顯示全部 section）' }),
  level: industryLevelSchema.nullable(),
  name: z.string().nullable(),
  companyCount: z.number().meta({ description: '這個節點（含所有子孫節點）底下總共幾家公司；樹根時是全部已追蹤公司數' }),
  children: z.array(industryTreeChildSchema).meta({ description: '直屬子節點；subclass 層級這裡永遠是空陣列' }),
  companies: z.array(industryCompanyEntrySchema).meta({
    description:
      '精確分類在這個 code 的公司（不含子孫節點）。因為每家公司都分類到 subclass 這個最細層級，' +
      '非 subclass 層級這裡永遠是空陣列——請改看 companyCount 判斷這個分支底下大概有多少公司，展開到 subclass 才會看到實際公司名單。',
  }),
});
export type IndustryTreeNodeResult = z.infer<typeof industryTreeNodeResultSchema>;


// 2026-09-14 新增——「產業追蹤」頁面重建成 playwright-py 供應鏈分類，見
// src/models/playwright/industryChainClassification.ts 的說明。跟上面 gov-ts 稅籍五層
// 分類（industryFlatResultSchema）是完全不同的分類體系（扁平 2 層，不是 5 層樹），刻意
// 獨立一組 schema，不合併/不相容。

export const chainClassificationCompanySchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  category: z.string().nullable().meta({ description: '33 個細分類其中之一；null 代表這家公司完全沒有出現在供應鏈報告裡（沒有任何已分類的邊）' }),
  coarseGroup: z.string().nullable().meta({ description: '10 組粗分類其中之一，category 為 null 時這裡也是 null' }),
  source: z.enum(['keyword', 'gemini']).nullable().meta({ description: '這家公司分類的判斷來源——2026-09-15 取代原本的 confidence/sampleSize，keyword 代表僅用免費關鍵字規則判斷、gemini 代表額外經過 Gemini 語意驗證/修正過，category 為 null 時這裡也是 null' }),
  updatedAt: z.string().nullable().meta({ description: '這家公司分類最後一次變動的日期（YYYY-MM-DD），不是查詢當下時間' }),
});

export const chainClassificationGroupSchema = z.object({
  coarseGroup: z.string(),
  fineCategories: z.array(z.string()).meta({ description: '這個粗分類底下涵蓋的細分類清單' }),
});

export const chainClassificationResultSchema = z.object({
  companies: z.array(chainClassificationCompanySchema).meta({ description: '全部上市櫃公司（不濾掉 category 為 null 的），目前約 1984 家' }),
  groups: z.array(chainClassificationGroupSchema).meta({ description: '10 組粗分類 -> 細分類對照表，給 drill-down 用' }),
});
export type ChainClassificationResult = z.infer<typeof chainClassificationResultSchema>;

// 2026-09-14 新增（第二輪）——playwright-py 的供應鏈聚落分群，跟上面 category/coarseGroup
// 是完全獨立的另一套分群概念，見 src/models/playwright/industryClusters.ts 的完整說明
// （⚠️ clusterId/subClusterId 不是穩定 id，不能當永久識別碼快取）。

export const chainClusterMemberSchema = z.object({
  code: z.string().meta({ description: '上市櫃公司代號，或外部/非上市公司的穩定 id（playwright-py 用公司名稱生成，不是股票代號）' }),
  name: z.string().nullable(),
  isListed: z.boolean().meta({ description: 'true 代表 code 是台股上市櫃公司（查得到 twse/tpex company_profile），false 代表外部/非上市公司節點，沒有對應的個股詳情頁可以連結' }),
});

export const chainClusterSubGroupSchema = z.object({
  subClusterId: z.number().meta({ description: '⚠️ 不是穩定 id，重新分群後編號會洗牌，不要快取' }),
  subLabel: z.string().nullable(),
  members: z.array(chainClusterMemberSchema),
});

export const chainClusterSchema = z.object({
  clusterId: z.number().meta({ description: '⚠️ 不是穩定 id，重新分群後編號會洗牌，不要快取' }),
  label: z.string().nullable(),
  directMembers: z.array(chainClusterMemberSchema).meta({ description: '沒有再切子聚落的直屬成員；是否為空陣列取決於 playwright-py 當下的分群演算法，不要假設固定規則（見 subClusters 說明）' }),
  subClusters: z.array(chainClusterSubGroupSchema).meta({ description: '這個頂層聚落底下的子聚落；分群演算法可能讓每個頂層聚落都有子聚落，也可能只有部分聚落有，沒有子聚落時是空陣列' }),
});

export const chainClustersResultSchema = z.object({
  clusters: z.array(chainClusterSchema).meta({ description: '全部頂層聚落，含全部成員（一次回傳整棵樹，不用逐一查詢）' }),
});
export type ChainClustersResult = z.infer<typeof chainClustersResultSchema>;

// 2026-09-11 新增——證交所類股分類（twse-ts/tpex-ts company_profile.industry，投資人習慣
// 的「半導體業」「電子零組件業」這種類股），跟上面財政部稅籍五層分類/tpex-ts 產業價值鏈都是
// 完全不同的體系：只有單一層級（不是樹狀），40 個代碼扁平列出，刻意獨立一組 schema。

export const securitiesIndustrySectorSchema = z.object({
  code: z.string().meta({ description: '兩碼證交所類股代碼，例如 "24"' }),
  name: z.string().meta({ description: '中文類股名稱，例如「半導體業」' }),
  companyCount: z.number().meta({ description: '這個類股底下總共幾家公司（TWSE+TPEx 加總）' }),
});

export const securitiesIndustrySectorsResultSchema = z.object({
  sectors: z.array(securitiesIndustrySectorSchema),
});
export type SecuritiesIndustrySectorsResult = z.infer<typeof securitiesIndustrySectorsResultSchema>;
