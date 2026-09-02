import { getSecuritySymbols } from '@/shared/sourceData/companyProfile';
import type { SecuritySymbolsQuery, SecuritySymbolsResult } from './types';

export const listSecuritySymbols = async (query: SecuritySymbolsQuery): Promise<SecuritySymbolsResult> => {
  const symbols = await getSecuritySymbols({
    market: query.market,
    includeEmerging: query.includeEmerging,
    excludeKy: query.excludeKy,
  });

  const warnings: string[] = [];
  if (query.excludeFullDelivery) {
    warnings.push('excludeFullDelivery 目前還沒有資料源支援，這次查詢沒有套用這個篩選——全額交割排除還在等 mops-ts/tpex-ts 的資料集。');
  }
  if (query.excludePreferredStock) {
    // 2026-09-02 查證過：這份清單的底層資料來自 company_profile（公司登記表），特別股不會有
    // 自己獨立的公司登記（跟母公司共用同一個法人），本來就不會出現在這份清單裡——不是
    // 「還沒排除」，是「結構上本來就沒有」，這個參數傳 true 沒有額外效果，也不需要真的去查
    // twse-ts 新開的 isin_securities（那份資料能查到特別股，但用途是「查特別股清單」，不是
    // 「從這份清單裡排除特別股」，兩件事不一樣）。
    warnings.push('excludePreferredStock 沒有實際效果——這份清單的資料來源（company_profile）本來就不含特別股，特別股沒有獨立的公司登記。');
  }

  return { count: symbols.length, symbols, warnings };
};
