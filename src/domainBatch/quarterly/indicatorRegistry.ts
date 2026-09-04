// 34 支依賴 mops 季度財報的指標登錄檔——2026-09-05 從 domainBatch/indicatorRegistry.ts
// 拆出來（原本的合併清單見 ../indicatorRegistry.ts），給 POST /batch/compute/quarterly
// 用。一家公司一季頂多變一次，跟 ../daily/（依賴每日股價/市場行情）刻意分開，避免每天對
// 財報資料白算一次。

import { getAllIncomeStatementSymbols } from '@/shared/sourceData/mopsQuarterlyStatements';
import type { IndicatorJob } from '../indicatorJob';
import { calculateEps } from '@/domainMetrics/profitability/eps/service';
import { calculateBvps } from '@/domainMetrics/profitability/bvps/service';
import { calculateRevenuePerShare } from '@/domainMetrics/profitability/revenuePerShare/service';
import { calculateMargins } from '@/domainMetrics/profitability/margins/service';
import { calculateRoe } from '@/domainMetrics/profitability/roe/service';
import { calculateRoa } from '@/domainMetrics/profitability/roa/service';
import { calculateRoic } from '@/domainMetrics/profitability/roic/service';
import { calculateRoce } from '@/domainMetrics/profitability/roce/service';
import { calculateDupont } from '@/domainMetrics/profitability/dupont/service';
import { calculateDividendPayoutRatio } from '@/domainMetrics/profitability/dividendPayoutRatio/service';
import { calculateSgr } from '@/domainMetrics/profitability/sgr/service';
import { calculateCashFlowPerShare } from '@/domainMetrics/cashFlow/cashFlowPerShare/service';
import { calculateOcfToNetIncome } from '@/domainMetrics/cashFlow/ocfToNetIncome/service';
import { calculateAccrualsRatio } from '@/domainMetrics/cashFlow/accrualsRatio/service';
import { calculateFcfYield } from '@/domainMetrics/cashFlow/fcfYield/service';
import { calculateDebtRatio } from '@/domainMetrics/solvency/debtRatio/service';
import { calculateLiquidityRatio } from '@/domainMetrics/solvency/liquidityRatio/service';
import { calculateDeRatio } from '@/domainMetrics/solvency/deRatio/service';
import { calculateInterestCoverage } from '@/domainMetrics/solvency/interestCoverage/service';
import { calculateNetDebtToEbitda } from '@/domainMetrics/solvency/netDebtToEbitda/service';
import { calculateTurnoverRatio } from '@/domainMetrics/turnover/turnoverRatio/service';
import { calculateCapexToRevenue } from '@/domainMetrics/turnover/capexToRevenue/service';
import { calculateGrahamNumber } from '@/domainMetrics/guru/grahamNumber/service';
import { calculateNcav } from '@/domainMetrics/guru/ncav/service';
import { calculateOwnerEarnings } from '@/domainMetrics/guru/ownerEarnings/service';
import { calculateAltmanZScore } from '@/domainMetrics/guru/altmanZScore/service';
import { calculatePiotroskiFScore } from '@/domainMetrics/guru/piotroskiFScore/service';
import { calculateBeneishMScore } from '@/domainMetrics/guru/beneishMScore/service';
import { calculateNissimPenmanRnoa } from '@/domainMetrics/guru/nissimPenmanRnoa/service';
import { calculateZmijewskiScore } from '@/domainMetrics/guru/zmijewskiScore/service';
import { calculateOhlsonOScore } from '@/domainMetrics/guru/ohlsonOScore/service';
import { calculatePsr } from '@/domainMetrics/valuation/psr/service';
import { calculatePFcf } from '@/domainMetrics/valuation/pFcf/service';
import { calculateEvEbitda } from '@/domainMetrics/valuation/evEbitda/service';

// 只查一次、被下面多個 job 共用。
const mopsIdsPromise = getAllIncomeStatementSymbols();

const mopsQuery = (symbol: string) => ({ symbol, dataType: '2' as const, subsidiaryCompanyId: '' });

export const quarterlyIndicatorJobs: IndicatorJob[] = [
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
  // valuation（psr/pFcf/evEbitda 需要 mops 財報，marketRatios 是 daily 那組）
  { name: 'psr', category: 'valuation', getCompanyIds: () => mopsIdsPromise, run: (id) => calculatePsr(mopsQuery(id)) },
  { name: 'pFcf', category: 'valuation', getCompanyIds: () => mopsIdsPromise, run: (id) => calculatePFcf(mopsQuery(id)) },
  { name: 'evEbitda', category: 'valuation', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateEvEbitda(mopsQuery(id)) },
];
