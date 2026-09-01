// 全部 44 支「單一公司、有 calculate* 函式」指標的登錄檔——2026-09-01 從
// scripts/batchComputeIndicators.ts 抽出來，讓批次預算腳本跟 src/domains/dataCompleteness/
// 共用同一份清單，不要兩邊各維護一份容易漂移。`macro/equityRiskPremium`（全市場單一值，沒有
// companyId）跟 `valuation/ranking`（本身是跨公司排行端點）不適用「單一公司」這個模式，
// 不列進來，見 scripts/batchComputeIndicators.ts 開頭的說明。

import prisma from '@/adapters/prisma/index';
import twsePrisma from '@/adapters/prisma/twseClient';
import tpexExportPrisma from '@/adapters/prisma/tpexExportClient';
import { getTwseCompanySymbolSet, getTpexCompanySymbolSet } from '@/shared/sourceData/companyProfile';
import { calculateEps } from '@/domains/metrics/profitability/eps/service';
import { calculateBvps } from '@/domains/metrics/profitability/bvps/service';
import { calculateRevenuePerShare } from '@/domains/metrics/profitability/revenuePerShare/service';
import { calculateMargins } from '@/domains/metrics/profitability/margins/service';
import { calculateRoe } from '@/domains/metrics/profitability/roe/service';
import { calculateRoa } from '@/domains/metrics/profitability/roa/service';
import { calculateRoic } from '@/domains/metrics/profitability/roic/service';
import { calculateRoce } from '@/domains/metrics/profitability/roce/service';
import { calculateDupont } from '@/domains/metrics/profitability/dupont/service';
import { calculateDividendPayoutRatio } from '@/domains/metrics/profitability/dividendPayoutRatio/service';
import { calculateSgr } from '@/domains/metrics/profitability/sgr/service';
import { calculateCashFlowPerShare } from '@/domains/metrics/cashFlow/cashFlowPerShare/service';
import { calculateOcfToNetIncome } from '@/domains/metrics/cashFlow/ocfToNetIncome/service';
import { calculateAccrualsRatio } from '@/domains/metrics/cashFlow/accrualsRatio/service';
import { calculateFcfYield } from '@/domains/metrics/cashFlow/fcfYield/service';
import { calculateDebtRatio } from '@/domains/metrics/solvency/debtRatio/service';
import { calculateLiquidityRatio } from '@/domains/metrics/solvency/liquidityRatio/service';
import { calculateDeRatio } from '@/domains/metrics/solvency/deRatio/service';
import { calculateInterestCoverage } from '@/domains/metrics/solvency/interestCoverage/service';
import { calculateNetDebtToEbitda } from '@/domains/metrics/solvency/netDebtToEbitda/service';
import { calculateTurnoverRatio } from '@/domains/metrics/turnover/turnoverRatio/service';
import { calculateCapexToRevenue } from '@/domains/metrics/turnover/capexToRevenue/service';
import { calculateGrahamNumber } from '@/domains/metrics/guru/grahamNumber/service';
import { calculateNcav } from '@/domains/metrics/guru/ncav/service';
import { calculateOwnerEarnings } from '@/domains/metrics/guru/ownerEarnings/service';
import { calculateAltmanZScore } from '@/domains/metrics/guru/altmanZScore/service';
import { calculatePiotroskiFScore } from '@/domains/metrics/guru/piotroskiFScore/service';
import { calculateBeneishMScore } from '@/domains/metrics/guru/beneishMScore/service';
import { calculateNissimPenmanRnoa } from '@/domains/metrics/guru/nissimPenmanRnoa/service';
import { calculateZmijewskiScore } from '@/domains/metrics/guru/zmijewskiScore/service';
import { calculateOhlsonOScore } from '@/domains/metrics/guru/ohlsonOScore/service';
import { calculatePsr } from '@/domains/metrics/valuation/psr/service';
import { calculatePFcf } from '@/domains/metrics/valuation/pFcf/service';
import { calculateEvEbitda } from '@/domains/metrics/valuation/evEbitda/service';
import { calculateMarketRatios } from '@/domains/metrics/valuation/marketRatios/service';
import { calculateBeta } from '@/domains/metrics/portfolio/beta/service';
import { calculateMa } from '@/domains/metrics/technicals/ma/service';
import { calculateRsi } from '@/domains/metrics/technicals/rsi/service';
import { calculateKd } from '@/domains/metrics/technicals/kd/service';
import { calculateBollingerBands } from '@/domains/metrics/technicals/bollingerBands/service';
import { calculateAtr } from '@/domains/metrics/technicals/atr/service';
import { calculateBiasIndicator } from '@/domains/metrics/technicals/bias/service';
import { calculateMacd } from '@/domains/metrics/technicals/macd/service';
import { calculateObv } from '@/domains/metrics/technicals/obv/service';

// 每個 result 都保證有的欄位——用來判斷這次呼叫「有沒有算出東西」，不用逐一解析每支指標
// 各自不同的 fieldStatuses/null 欄位規則（見 src/shared/metricStatus.ts 開頭說明：這個結構化
// 規範目前只套用在約一半的指標，另一半還是「null + warnings 純文字」，兩者唯一共同的欄位
// 就是 warnings，見 src/domains/dataCompleteness/service.ts 怎麼用這個欄位判斷完整度）。
export interface IndicatorResult {
  warnings: string[];
}

export interface IndicatorJob {
  name: string; // 對應 filterCatalog metric key
  category: string; // 對應 filterCatalog category key，給完整度報告分組用
  getCompanyIds: () => Promise<string[]>;
  run: (companyId: string) => Promise<IndicatorResult>;
}

// 三個公司清單來源，各自只查一次、被多個 job 共用。
const mopsIdsPromise = prisma.quarterlyIncomeStatement.findMany({ distinct: ['symbol'], select: { symbol: true } }).then((rows) => rows.map((r) => r.symbol));
const twsePriceIdsPromise = twsePrisma.dailyPrice.findMany({ distinct: ['symbol'], select: { symbol: true } }).then((rows) => rows.map((r) => r.symbol));
// TPEx 這邊 2026-09-01 改走 export.daily_valuation（$queryRaw，這張 view 沒有 model 存取子，
// 取代讀 tpex-ts dev 環境的舊帳號）。同一次順便排除 ETF/衍生性商品——marketRatios 存進
// valuation_market_ratios（screener 的 per/pbr/dividendYield 就是查這張表），本益比/淨值比
// 對 ETF 這種基金型商品本來就沒有意義（沒有自己的盈餘/淨值），跟公司股票混在一起排也不是
// 使用者要的東西，見 src/shared/sourceData/companyProfile.ts 的說明。
const marketRatiosIdsPromise = Promise.all([
  twsePrisma.dailyValuation.findMany({ distinct: ['symbol'], select: { symbol: true } }),
  tpexExportPrisma.$queryRaw<{ symbol: string }[]>`SELECT DISTINCT symbol FROM "export"."daily_valuation"`,
  getTwseCompanySymbolSet(),
  getTpexCompanySymbolSet(),
]).then(([twseRows, tpexRows, twseCompanySymbols, tpexCompanySymbols]) => {
  const allValuationSymbols = new Set([...twseRows.map((r) => r.symbol), ...tpexRows.map((r) => r.symbol)]);
  const allCompanySymbols = new Set([...twseCompanySymbols, ...tpexCompanySymbols]);
  return [...allValuationSymbols].filter((symbol) => allCompanySymbols.has(symbol));
});

const mopsQuery = (companyId: string) => ({ companyId, dataType: '2' as const, subsidiaryCompanyId: '' });

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
  { name: 'marketRatios', category: 'valuation', getCompanyIds: () => marketRatiosIdsPromise, run: (id) => calculateMarketRatios({ companyId: id }) },
  // portfolio + technicals（純市場資料）
  { name: 'beta', category: 'portfolio', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateBeta({ companyId: id }) },
  { name: 'ma', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateMa({ companyId: id }) },
  { name: 'rsi', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateRsi({ companyId: id }) },
  { name: 'kd', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateKd({ companyId: id }) },
  { name: 'bollingerBands', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateBollingerBands({ companyId: id }) },
  { name: 'atr', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateAtr({ companyId: id }) },
  { name: 'bias', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateBiasIndicator({ companyId: id }) },
  { name: 'macd', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateMacd({ companyId: id }) },
  { name: 'obv', category: 'technicals', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateObv({ companyId: id }) },
];
