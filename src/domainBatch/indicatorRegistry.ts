// 全部 44 支「單一公司、有 calculate* 函式」指標的登錄檔——2026-09-01 從
// scripts/batchComputeIndicators.ts 抽出來，讓批次預算腳本跟其他呼叫端共用同一份清單，不要
// 各自維護一份容易漂移。`macro/equityRiskPremium`（全市場單一值，沒有 symbol）跟
// `valuation/ranking`（本身是跨公司排行端點）不適用「單一公司」這個模式，不列進來，見
// scripts/batchComputeIndicators.ts 開頭的說明。
//
// 2026-09-04：計算邏輯本體（`./metrics/**/service.ts`，含 upsert 進 analysis 結果表的動作）
// 從 `domainApi/metrics/**` 搬進這裡——這份邏輯只有 domainBatch 會呼叫，不是兩個入口共用的
// 中立層，所以不放 shared/，直接歸 domainBatch 所有。domainApi 這邊改走「先讀結果表、查不到
// 才委派給這裡補算」的模式（見 `GET /companies/metrics`，
// `src/domainApi/companies/metricsService.ts`），不會再直接呼叫 calculate*——原本共用這份
// 清單的 `domainApi/dataCompleteness/`（單一公司完整度診斷工具）跟 44 支單一指標舊端點
// 已經一併刪除。

import { twseExportPrisma } from '@/adapters/prisma/twseExportClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getSecuritySymbolSet } from '@/shared/sourceData/companyProfile';
import { getAllIncomeStatementSymbols } from '@/shared/sourceData/mopsQuarterlyStatements';
import { calculateEps } from './metrics/profitability/eps/service';
import { calculateBvps } from './metrics/profitability/bvps/service';
import { calculateRevenuePerShare } from './metrics/profitability/revenuePerShare/service';
import { calculateMargins } from './metrics/profitability/margins/service';
import { calculateRoe } from './metrics/profitability/roe/service';
import { calculateRoa } from './metrics/profitability/roa/service';
import { calculateRoic } from './metrics/profitability/roic/service';
import { calculateRoce } from './metrics/profitability/roce/service';
import { calculateDupont } from './metrics/profitability/dupont/service';
import { calculateDividendPayoutRatio } from './metrics/profitability/dividendPayoutRatio/service';
import { calculateSgr } from './metrics/profitability/sgr/service';
import { calculateCashFlowPerShare } from './metrics/cashFlow/cashFlowPerShare/service';
import { calculateOcfToNetIncome } from './metrics/cashFlow/ocfToNetIncome/service';
import { calculateAccrualsRatio } from './metrics/cashFlow/accrualsRatio/service';
import { calculateFcfYield } from './metrics/cashFlow/fcfYield/service';
import { calculateDebtRatio } from './metrics/solvency/debtRatio/service';
import { calculateLiquidityRatio } from './metrics/solvency/liquidityRatio/service';
import { calculateDeRatio } from './metrics/solvency/deRatio/service';
import { calculateInterestCoverage } from './metrics/solvency/interestCoverage/service';
import { calculateNetDebtToEbitda } from './metrics/solvency/netDebtToEbitda/service';
import { calculateTurnoverRatio } from './metrics/turnover/turnoverRatio/service';
import { calculateCapexToRevenue } from './metrics/turnover/capexToRevenue/service';
import { calculateGrahamNumber } from './metrics/guru/grahamNumber/service';
import { calculateNcav } from './metrics/guru/ncav/service';
import { calculateOwnerEarnings } from './metrics/guru/ownerEarnings/service';
import { calculateAltmanZScore } from './metrics/guru/altmanZScore/service';
import { calculatePiotroskiFScore } from './metrics/guru/piotroskiFScore/service';
import { calculateBeneishMScore } from './metrics/guru/beneishMScore/service';
import { calculateNissimPenmanRnoa } from './metrics/guru/nissimPenmanRnoa/service';
import { calculateZmijewskiScore } from './metrics/guru/zmijewskiScore/service';
import { calculateOhlsonOScore } from './metrics/guru/ohlsonOScore/service';
import { calculatePsr } from './metrics/valuation/psr/service';
import { calculatePFcf } from './metrics/valuation/pFcf/service';
import { calculateEvEbitda } from './metrics/valuation/evEbitda/service';
import { calculateMarketRatios } from './metrics/valuation/marketRatios/service';
import { calculateBeta } from './metrics/portfolio/beta/service';
import { calculateMa } from './metrics/technicals/ma/service';
import { calculateRsi } from './metrics/technicals/rsi/service';
import { calculateKd } from './metrics/technicals/kd/service';
import { calculateBollingerBands } from './metrics/technicals/bollingerBands/service';
import { calculateAtr } from './metrics/technicals/atr/service';
import { calculateBiasIndicator } from './metrics/technicals/bias/service';
import { calculateMacd } from './metrics/technicals/macd/service';
import { calculateObv } from './metrics/technicals/obv/service';

// 每個 result 都保證有的欄位——用來判斷這次呼叫「有沒有算出東西」，不用逐一解析每支指標
// 各自不同的 fieldStatuses/null 欄位規則（見 src/shared/metricStatus.ts 開頭說明：這個結構化
// 規範目前只套用在約一半的指標，另一半還是「null + warnings 純文字」，兩者唯一共同的欄位
// 就是 warnings）。
export interface IndicatorResult {
  warnings: string[];
}

export interface IndicatorJob {
  name: string; // 對應 filterCatalog metric key
  category: string; // 對應 filterCatalog category key，給完整度報告分組用
  getCompanyIds: () => Promise<string[]>;
  run: (symbol: string) => Promise<IndicatorResult>;
}

// 三個公司清單來源，各自只查一次、被多個 job 共用。
const mopsIdsPromise = getAllIncomeStatementSymbols();
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

const mopsQuery = (symbol: string) => ({ symbol, dataType: '2' as const, subsidiaryCompanyId: '' });

export const indicatorJobs: IndicatorJob[] = [
  // profitability
  { name: 'eps', category: 'profitability', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateEps(mopsQuery(id)) },
  { name: 'bvps', category: 'profitability', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateBvps(mopsQuery(id)) },
  { name: 'revenuePerShare', category: 'profitability', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateRevenuePerShare(mopsQuery(id)) },
  { name: 'margins', category: 'profitability', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateMargins(mopsQuery(id)) },
  { name: 'roe', category: 'profitability', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateRoe(mopsQuery(id)) },
  { name: 'roa', category: 'profitability', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateRoa(mopsQuery(id)) },
  { name: 'roic', category: 'profitability', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateRoic(mopsQuery(id)) },
  { name: 'roce', category: 'profitability', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateRoce(mopsQuery(id)) },
  { name: 'dupont', category: 'profitability', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateDupont(mopsQuery(id)) },
  { name: 'dividendPayoutRatio', category: 'profitability', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateDividendPayoutRatio(mopsQuery(id)) },
  { name: 'sgr', category: 'profitability', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateSgr(mopsQuery(id)) },
  // cashFlow
  { name: 'cashFlowPerShare', category: 'cashFlow', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateCashFlowPerShare(mopsQuery(id)) },
  { name: 'ocfToNetIncome', category: 'cashFlow', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateOcfToNetIncome(mopsQuery(id)) },
  { name: 'accrualsRatio', category: 'cashFlow', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateAccrualsRatio(mopsQuery(id)) },
  { name: 'fcfYield', category: 'cashFlow', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateFcfYield(mopsQuery(id)) },
  // solvency
  { name: 'debtRatio', category: 'solvency', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateDebtRatio(mopsQuery(id)) },
  { name: 'liquidityRatio', category: 'solvency', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateLiquidityRatio(mopsQuery(id)) },
  { name: 'deRatio', category: 'solvency', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateDeRatio(mopsQuery(id)) },
  { name: 'interestCoverage', category: 'solvency', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateInterestCoverage(mopsQuery(id)) },
  { name: 'netDebtToEbitda', category: 'solvency', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateNetDebtToEbitda(mopsQuery(id)) },
  // turnover
  { name: 'turnoverRatio', category: 'turnover', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateTurnoverRatio(mopsQuery(id)) },
  { name: 'capexToRevenue', category: 'turnover', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateCapexToRevenue(mopsQuery(id)) },
  // guru
  { name: 'grahamNumber', category: 'guru', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateGrahamNumber(mopsQuery(id)) },
  { name: 'ncav', category: 'guru', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateNcav(mopsQuery(id)) },
  { name: 'ownerEarnings', category: 'guru', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateOwnerEarnings(mopsQuery(id)) },
  { name: 'altmanZScore', category: 'guru', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateAltmanZScore(mopsQuery(id)) },
  { name: 'piotroskiFScore', category: 'guru', getCompanyIds: () => mopsIdsPromise, run: (id) => calculatePiotroskiFScore(mopsQuery(id)) },
  { name: 'beneishMScore', category: 'guru', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateBeneishMScore(mopsQuery(id)) },
  { name: 'nissimPenmanRnoa', category: 'guru', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateNissimPenmanRnoa(mopsQuery(id)) },
  { name: 'zmijewskiScore', category: 'guru', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateZmijewskiScore(mopsQuery(id)) },
  { name: 'ohlsonOScore', category: 'guru', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateOhlsonOScore(mopsQuery(id)) },
  // valuation（psr/pFcf/evEbitda 需要 mops 財報，marketRatios 純市場資料）
  { name: 'psr', category: 'valuation', getCompanyIds: () => mopsIdsPromise, run: (id) => calculatePsr(mopsQuery(id)) },
  { name: 'pFcf', category: 'valuation', getCompanyIds: () => mopsIdsPromise, run: (id) => calculatePFcf(mopsQuery(id)) },
  { name: 'evEbitda', category: 'valuation', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateEvEbitda(mopsQuery(id)) },
  { name: 'marketRatios', category: 'valuation', getCompanyIds: () => marketRatiosIdsPromise, run: (id) => calculateMarketRatios({ symbol: id }) },
  // portfolio + technicals（純市場資料）
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
