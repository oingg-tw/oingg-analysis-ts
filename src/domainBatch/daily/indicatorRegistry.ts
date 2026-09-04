// 10 支依賴每日股價/市場行情的指標登錄檔——2026-09-05 從 domainBatch/indicatorRegistry.ts
// 拆出來（原本的合併清單見 ../indicatorRegistry.ts），給 POST /batch/compute/daily 用。
// 這些資料每天更新，跟 ../quarterly/（依賴季度財報，一季才變一次）刻意分開，確保每天觸發
// 不會跟股價脫節。

import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getSecuritySymbolSet } from '@/shared/sourceData/companyProfile';
import type { IndicatorJob } from '../indicatorJob';
import { calculateMarketRatios } from '../metrics/valuation/marketRatios/service';
import { calculateBeta } from '../metrics/portfolio/beta/service';
import { calculateMa } from '../metrics/technicals/ma/service';
import { calculateRsi } from '../metrics/technicals/rsi/service';
import { calculateKd } from '../metrics/technicals/kd/service';
import { calculateBollingerBands } from '../metrics/technicals/bollingerBands/service';
import { calculateAtr } from '../metrics/technicals/atr/service';
import { calculateBiasIndicator } from '../metrics/technicals/bias/service';
import { calculateMacd } from '../metrics/technicals/macd/service';
import { calculateObv } from '../metrics/technicals/obv/service';

const twsePriceIdsPromise = twseExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT DISTINCT symbol FROM "export"."daily_price"`.then((rows) => rows.map((r) => r.symbol));

// 2026-09-01 起 TPEx 走 export.daily_valuation（$queryRaw，這張 view 沒有 model 存取子）；
// 2026-09-03 TWSE 也改成同一種模式（使用者決定 curated 中台層現階段太早，改回直接查
// export schema）。同一次順便排除 ETF/衍生性商品——marketRatios 存進 valuation_market_ratios
// （screener 的 per/pbr/dividendYield 就是查這張表），本益比/淨值比對 ETF 這種基金型商品本來
// 就沒有意義（沒有自己的盈餘/淨值），跟公司股票混在一起排也不是使用者要的東西，見
// src/shared/sourceData/companyProfile.ts 的說明。
const marketRatiosIdsPromise = Promise.all([
  twseExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT DISTINCT symbol FROM "export"."daily_valuation"`,
  tpexExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT DISTINCT symbol FROM "export"."daily_valuation"`,
  getSecuritySymbolSet({ preferredStock: 'exclude' }), // 不給 market，兩個市場一起查，維持原本合併成單一集合的行為。
]).then(([twseRows, tpexRows, allCompanySymbols]) => {
  const allValuationSymbols = new Set([...twseRows.map((r) => r.symbol), ...tpexRows.map((r) => r.symbol)]);
  return [...allValuationSymbols].filter((symbol) => allCompanySymbols.has(symbol));
});

export const dailyIndicatorJobs: IndicatorJob[] = [
  { name: 'marketRatios', category: 'valuation', getCompanyIds: () => marketRatiosIdsPromise, run: (id) => calculateMarketRatios({ symbol: id }) },
  { name: 'beta', category: 'portfolio', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateBeta({ symbol: id }) },
  { name: 'ma', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateMa({ symbol: id }) },
  { name: 'rsi', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateRsi({ symbol: id }) },
  { name: 'kd', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateKd({ symbol: id }) },
  { name: 'bollingerBands', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateBollingerBands({ symbol: id }) },
  { name: 'atr', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateAtr({ symbol: id }) },
  { name: 'bias', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateBiasIndicator({ symbol: id }) },
  { name: 'macd', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateMacd({ symbol: id }) },
  { name: 'obv', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateObv({ symbol: id }) },
];
