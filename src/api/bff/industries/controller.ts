import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getCompanyNamesForSymbols } from '@/shared/sourceData/companyProfile';
import { getIndustryNodeInfo, listIndustryChildren, listIndustryCompanies } from '@/shared/sourceData/industryClassification';

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
