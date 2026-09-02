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
    warnings.push('excludePreferredStock 目前還沒有資料源支援，這次查詢沒有套用這個篩選——已經請 twse-ts 開放特別股分類資料，還沒收到完成通知。');
  }

  return { count: symbols.length, symbols, warnings };
};
