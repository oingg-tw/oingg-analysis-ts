import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getCompanyNamesForSymbols } from '@/models/companyProfile';
import { getIndustryNodeInfo, listIndustryChildren, listIndustryCompanies, listAllCompanyIndustryPaths } from '@/models/gov/industryClassification';
import { listAllCompanyCategories, listCategoryGroups } from '@/models/playwright/industryChainClassification';
import { listIndustryClusters, getExternalCompanyName } from '@/models/playwright/industryClusters';
import { listSecuritiesIndustrySectors } from '@/models/securitiesIndustry';

export const getIndustryTreeQuerySchema = z.object({
  code: z.string().min(1).optional().meta({
    description: '產業分類代碼（section/division/group/class/subclass 任一層級皆可，代碼本身全域唯一，不需要另外指定 level）。不給則回傳樹根（全部 section）。',
    example: 'C',
  }),
});

// 給「產業追蹤」樹狀瀏覽頁面用——純瀏覽語意，不做動態層級回退（跟 GET /companies/peer-group
// 的 findPeerGroup 是刻意分開的兩種查詢），見 industryClassification.ts 的說明。
export const getIndustryTree = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationResult = getIndustryTreeQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ message: 'Invalid query parameters.', errors: validationResult.error.format() });
    }

    const code = validationResult.data.code ?? null;
    const nodeInfo = getIndustryNodeInfo(code);
    if (!nodeInfo) {
      return res.status(200).json({ found: false, code, level: null, name: null, companyCount: 0, children: [], companies: [] });
    }

    const children = listIndustryChildren(code);
    const companySymbols = code === null ? [] : listIndustryCompanies(code);
    const nameMap = await getCompanyNamesForSymbols(companySymbols);

    res.status(200).json({
      found: true,
      code: nodeInfo.code,
      level: nodeInfo.level,
      name: nodeInfo.name,
      companyCount: nodeInfo.companyCount,
      children,
      companies: companySymbols.map((symbol) => ({ symbol, companyName: nameMap.get(symbol) ?? null })),
    });
  } catch (error) {
    next(error);
  }
};

// 2026-09-09 應 bff-ts 要求新增——給「產業追蹤」頁的搜尋功能用（股票代號或分類名稱關鍵字
// 跳到樹狀節點），一次回傳全部已分類公司的 symbol -> 完整路徑對照表，前端自己建索引，不用
// 遞迴打 ~999 次 GET /industries/tree。見 industryClassification.ts 的
// listAllCompanyIndustryPaths() 說明。沒有查詢參數，純讀記憶體快取，成本低。
export const getIndustryFlat = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const paths = listAllCompanyIndustryPaths();
    const nameMap = await getCompanyNamesForSymbols(paths.map((p) => p.symbol));
    res.status(200).json({
      companies: paths.map((p) => ({ symbol: p.symbol, companyName: nameMap.get(p.symbol) ?? null, path: p.path })),
    });
  } catch (error) {
    next(error);
  }
};

// 2026-09-14 應 web-nuxt 要求新增——「產業追蹤」頁面重建成 playwright-py 供應鏈分類（取代
// 舊版用 GET /industries/tree/flat 的 gov-ts 稅籍分類樹），一次回傳全部公司的分類 +
// 10 組粗分類對照表，讓前端自己做 drill-down（粗分類 -> 細分類 -> 公司），不用逐一查詢。
// 跟 GET /companies/peer-group（單一公司找同業）是同一份底層快取，但用途不同，刻意分開：
// 這支是批次瀏覽（比照舊版 GET /industries/flat 的精神），那支是單一公司查詢。
export const getIndustryChainClassification = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const companies = listAllCompanyCategories();
    const nameMap = await getCompanyNamesForSymbols(companies.map((c) => c.symbol));
    res.status(200).json({
      companies: companies.map((c) => ({
        symbol: c.symbol,
        companyName: nameMap.get(c.symbol) ?? null,
        category: c.category,
        coarseGroup: c.coarseGroup,
        source: c.source,
        updatedAt: c.updatedAt?.toISOString().slice(0, 10) ?? null,
      })),
      groups: listCategoryGroups(),
    });
  } catch (error) {
    next(error);
  }
};

// 2026-09-14 應 web-nuxt 要求新增（第二輪，聚落樹）——playwright-py 的供應鏈聚落分群
// （人工中文標籤，見 industryClusters.ts 檔頭關於分群演算法/數量會變動的完整說明），
// 跟上面 getIndustryChainClassification 的 category/coarseGroup 是完全獨立的另一套
// 分群概念（⚠️ cluster_id 不穩定，前端不能拿它當永久識別碼快取）。一次回傳整棵樹
// （全部頂層聚落 + 子聚落 + 全部成員），成員 code 混雜上市櫃公司跟外部/非上市公司
// （供應鏈脈絡完整度優先），isListed 標示這個 code 查不查得到 twse/tpex company_profile，
// 前端可以用這個欄位決定要不要讓使用者點進公司
// 詳情頁（非上市公司沒有對應的個股頁面）。
export const getIndustryChainClusters = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const clusters = listIndustryClusters();
    const allCodes = clusters.flatMap((c) => [...c.directMemberCodes, ...c.subClusters.flatMap((s) => s.memberCodes)]);
    const nameMap = await getCompanyNamesForSymbols(allCodes);

    const resolveMember = (code: string) => {
      const listedName = nameMap.get(code);
      if (listedName !== undefined) return { code, name: listedName, isListed: true };
      const external = getExternalCompanyName(code);
      return { code, name: external?.nameZh ?? external?.nameEn ?? null, isListed: false };
    };

    res.status(200).json({
      clusters: clusters.map((c) => ({
        clusterId: c.clusterId,
        label: c.label,
        directMembers: c.directMemberCodes.map(resolveMember),
        subClusters: c.subClusters.map((s) => ({
          subClusterId: s.subClusterId,
          subLabel: s.subLabel,
          members: s.memberCodes.map(resolveMember),
        })),
      })),
    });
  } catch (error) {
    next(error);
  }
};

// 2026-09-11 應使用者要求新增——給 screener 的 industryCodes 產業篩選（見
// src/api/bff/screener/service.ts）取得合法代碼用，也可以單獨拿來做類股瀏覽 UI。跟上面
// GET /industries/tree 是不同分類體系（證交所類股 vs 財政部稅籍），刻意獨立端點，不合併。
export const getSecuritiesIndustrySectors = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sectors = await listSecuritiesIndustrySectors();
    res.status(200).json({ sectors });
  } catch (error) {
    next(error);
  }
};

