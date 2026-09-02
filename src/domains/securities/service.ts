import { getSecuritySymbols } from '@/shared/sourceData/companyProfile';
import type { SecuritySymbolsQuery, SecuritySymbolsResult } from './types';

export const listSecuritySymbols = async (query: SecuritySymbolsQuery): Promise<SecuritySymbolsResult> => {
  const symbols = await getSecuritySymbols({
    market: query.market,
    includeEmerging: query.includeEmerging,
    excludeKy: query.excludeKy,
    preferredStock: query.preferredStock,
  });

  const warnings: string[] = [];
  if (query.excludeFullDelivery) {
    warnings.push('excludeFullDelivery 目前還沒有資料源支援，這次查詢沒有套用這個篩選——全額交割排除還在等 mops-ts/tpex-ts 的資料集。');
  }
  if (query.preferredStock === 'only' && query.market === 'TPEx') {
    warnings.push('特別股資料源（twse-ts 的 isin_securities）目前只有 TWSE，market=TPEx + preferredStock=only 這個組合一定回空清單，不是查詢失敗。');
  }

  return { count: symbols.length, symbols, warnings };
};
