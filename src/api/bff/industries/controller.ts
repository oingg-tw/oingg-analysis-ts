import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import { getIndustryNodeInfo, listIndustryChildren, listIndustryCompanies, listAllCompanyIndustryPaths } from '@/shared/sourceData/industryClassification';
import { listSecuritiesIndustrySectors } from '@/shared/sourceData/securitiesIndustry';

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

