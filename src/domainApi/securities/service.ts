import { getSecuritySymbols } from '@/shared/sourceData/companyProfile';
import type { SecuritySymbolsQuery, SecuritySymbolsResult } from './types';

export const listSecuritySymbols = async (query: SecuritySymbolsQuery): Promise<SecuritySymbolsResult> => {
  const symbols = await getSecuritySymbols({
    market: query.market,
    includeEmerging: query.includeEmerging,
    excludeKy: query.excludeKy,
    preferredStock: query.preferredStock,
    excludeFullDelivery: query.excludeFullDelivery,
  });

  const warnings: string[] = [];
  if (query.preferredStock === 'only' && query.market === 'TPEx') {
    warnings.push('特別股資料源（twse-ts 的 isin_securities）目前只有 TWSE，market=TPEx + preferredStock=only 這個組合一定回空清單，不是查詢失敗。');
  }

  return { count: symbols.length, symbols, warnings };
};
