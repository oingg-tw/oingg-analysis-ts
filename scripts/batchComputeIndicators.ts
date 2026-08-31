// 全市場批次預算——直接呼叫現有的 calculate* 函式（不透過 HTTP），逐一幫「目前實際查得到的
// 每一家公司」把指標算過一輪、upsert 進對應的 analysis 表。這是快取的預先填充，不是新的計算
// 邏輯——每支指標的公式/優雅降級規則完全沿用各自 service.ts 既有的實作。
//
// 兩種公司清單來源，動態查詢、不寫死清單或數量（見 2026-08-31 的盤點）：
// - mops 季度財報（quarterly_income_statement）目前只 ingest 過 27 家公司，`profitability`/
//   `cashFlow`/`solvency`/`turnover`/`guru`/`valuation` 的 psr/pFcf/evEbitda 這批指標受限於此，
//   不是這支腳本能解決的，mops-ts ingest 更多公司財報後這裡會自動涵蓋，不用改程式碼。
// - twse `daily_price`／twse+tpex `daily_valuation` 涵蓋 1,000+ 家，`portfolio/beta`、
//   `technicals` 8 個指標、`valuation/marketRatios` 走這條路線。
//
// `macro/equityRiskPremium`（全市場單一值，沒有 companyId）跟 `valuation/ranking`（本身是跨公司
// 排行端點）不適用「逐公司批次」這個模式，不列進來。
//
// 觸發方式：手動跑 `pnpm batch:compute`，比照使用者要求移除 `/system/sync/:backend/:dataset`
// 端點的決定，這次同樣不開 HTTP 觸發——排程要怎麼接、多久跑一次，是這支腳本驗證過之後的下一步。

import prisma from '../src/adapters/prisma/index';
import twsePrisma from '../src/adapters/prisma/twseClient';
import tpexPrisma from '../src/adapters/prisma/tpexClient';
import { analysisPrisma } from '../src/adapters/prisma/analysisClient';
import { calculateEps } from '../src/domains/metrics/profitability/eps/service';
import { calculateBvps } from '../src/domains/metrics/profitability/bvps/service';
import { calculateRevenuePerShare } from '../src/domains/metrics/profitability/revenuePerShare/service';
import { calculateMargins } from '../src/domains/metrics/profitability/margins/service';
import { calculateRoe } from '../src/domains/metrics/profitability/roe/service';
import { calculateRoa } from '../src/domains/metrics/profitability/roa/service';
import { calculateRoic } from '../src/domains/metrics/profitability/roic/service';
import { calculateRoce } from '../src/domains/metrics/profitability/roce/service';
import { calculateDupont } from '../src/domains/metrics/profitability/dupont/service';
import { calculateDividendPayoutRatio } from '../src/domains/metrics/profitability/dividendPayoutRatio/service';
import { calculateSgr } from '../src/domains/metrics/profitability/sgr/service';
import { calculateCashFlowPerShare } from '../src/domains/metrics/cashFlow/cashFlowPerShare/service';
import { calculateOcfToNetIncome } from '../src/domains/metrics/cashFlow/ocfToNetIncome/service';
import { calculateAccrualsRatio } from '../src/domains/metrics/cashFlow/accrualsRatio/service';
import { calculateFcfYield } from '../src/domains/metrics/cashFlow/fcfYield/service';
import { calculateDebtRatio } from '../src/domains/metrics/solvency/debtRatio/service';
import { calculateLiquidityRatio } from '../src/domains/metrics/solvency/liquidityRatio/service';
import { calculateDeRatio } from '../src/domains/metrics/solvency/deRatio/service';
import { calculateInterestCoverage } from '../src/domains/metrics/solvency/interestCoverage/service';
import { calculateNetDebtToEbitda } from '../src/domains/metrics/solvency/netDebtToEbitda/service';
import { calculateTurnoverRatio } from '../src/domains/metrics/turnover/turnoverRatio/service';
import { calculateCapexToRevenue } from '../src/domains/metrics/turnover/capexToRevenue/service';
import { calculateGrahamNumber } from '../src/domains/metrics/guru/grahamNumber/service';
import { calculateNcav } from '../src/domains/metrics/guru/ncav/service';
import { calculateOwnerEarnings } from '../src/domains/metrics/guru/ownerEarnings/service';
import { calculateAltmanZScore } from '../src/domains/metrics/guru/altmanZScore/service';
import { calculatePiotroskiFScore } from '../src/domains/metrics/guru/piotroskiFScore/service';
import { calculateBeneishMScore } from '../src/domains/metrics/guru/beneishMScore/service';
import { calculateNissimPenmanRnoa } from '../src/domains/metrics/guru/nissimPenmanRnoa/service';
import { calculateZmijewskiScore } from '../src/domains/metrics/guru/zmijewskiScore/service';
import { calculateOhlsonOScore } from '../src/domains/metrics/guru/ohlsonOScore/service';
import { calculatePsr } from '../src/domains/metrics/valuation/psr/service';
import { calculatePFcf } from '../src/domains/metrics/valuation/pFcf/service';
import { calculateEvEbitda } from '../src/domains/metrics/valuation/evEbitda/service';
import { calculateMarketRatios } from '../src/domains/metrics/valuation/marketRatios/service';
import { calculateBeta } from '../src/domains/metrics/portfolio/beta/service';
import { calculateMa } from '../src/domains/metrics/technicals/ma/service';
import { calculateRsi } from '../src/domains/metrics/technicals/rsi/service';
import { calculateKd } from '../src/domains/metrics/technicals/kd/service';
import { calculateBollingerBands } from '../src/domains/metrics/technicals/bollingerBands/service';
import { calculateAtr } from '../src/domains/metrics/technicals/atr/service';
import { calculateBiasIndicator } from '../src/domains/metrics/technicals/bias/service';
import { calculateMacd } from '../src/domains/metrics/technicals/macd/service';
import { calculateObv } from '../src/domains/metrics/technicals/obv/service';

interface BatchJob {
  name: string;
  getCompanyIds: () => Promise<string[]>;
  run: (companyId: string) => Promise<unknown>;
}

// 三個公司清單來源，各自只查一次、被多個 job 共用（見檔案開頭說明）。
const mopsIdsPromise = prisma.quarterlyIncomeStatement.findMany({ distinct: ['symbol'], select: { symbol: true } }).then((rows) => rows.map((r) => r.symbol));
const twsePriceIdsPromise = twsePrisma.dailyPrice.findMany({ distinct: ['symbol'], select: { symbol: true } }).then((rows) => rows.map((r) => r.symbol));
const marketRatiosIdsPromise = Promise.all([
  twsePrisma.dailyValuation.findMany({ distinct: ['symbol'], select: { symbol: true } }),
  tpexPrisma.dailyValuation.findMany({ distinct: ['symbol'], select: { symbol: true } }),
]).then(([twseRows, tpexRows]) => [...new Set([...twseRows.map((r) => r.symbol), ...tpexRows.map((r) => r.symbol)])]);

const mopsQuery = (companyId: string) => ({ companyId, dataType: '2' as const, subsidiaryCompanyId: '' });

const jobs: BatchJob[] = [
  // profitability
  { name: 'eps', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateEps(mopsQuery(id)) },
  { name: 'bvps', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateBvps(mopsQuery(id)) },
  { name: 'revenuePerShare', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateRevenuePerShare(mopsQuery(id)) },
  { name: 'margins', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateMargins(mopsQuery(id)) },
  { name: 'roe', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateRoe(mopsQuery(id)) },
  { name: 'roa', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateRoa(mopsQuery(id)) },
  { name: 'roic', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateRoic(mopsQuery(id)) },
  { name: 'roce', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateRoce(mopsQuery(id)) },
  { name: 'dupont', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateDupont(mopsQuery(id)) },
  { name: 'dividendPayoutRatio', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateDividendPayoutRatio(mopsQuery(id)) },
  { name: 'sgr', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateSgr(mopsQuery(id)) },
  // cashFlow
  { name: 'cashFlowPerShare', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateCashFlowPerShare(mopsQuery(id)) },
  { name: 'ocfToNetIncome', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateOcfToNetIncome(mopsQuery(id)) },
  { name: 'accrualsRatio', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateAccrualsRatio(mopsQuery(id)) },
  { name: 'fcfYield', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateFcfYield(mopsQuery(id)) },
  // solvency
  { name: 'debtRatio', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateDebtRatio(mopsQuery(id)) },
  { name: 'liquidityRatio', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateLiquidityRatio(mopsQuery(id)) },
  { name: 'deRatio', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateDeRatio(mopsQuery(id)) },
  { name: 'interestCoverage', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateInterestCoverage(mopsQuery(id)) },
  { name: 'netDebtToEbitda', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateNetDebtToEbitda(mopsQuery(id)) },
  // turnover
  { name: 'turnoverRatio', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateTurnoverRatio(mopsQuery(id)) },
  { name: 'capexToRevenue', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateCapexToRevenue(mopsQuery(id)) },
  // guru
  { name: 'grahamNumber', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateGrahamNumber(mopsQuery(id)) },
  { name: 'ncav', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateNcav(mopsQuery(id)) },
  { name: 'ownerEarnings', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateOwnerEarnings(mopsQuery(id)) },
  { name: 'altmanZScore', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateAltmanZScore(mopsQuery(id)) },
  { name: 'piotroskiFScore', getCompanyIds: () => mopsIdsPromise, run: (id) => calculatePiotroskiFScore(mopsQuery(id)) },
  { name: 'beneishMScore', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateBeneishMScore(mopsQuery(id)) },
  { name: 'nissimPenmanRnoa', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateNissimPenmanRnoa(mopsQuery(id)) },
  { name: 'zmijewskiScore', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateZmijewskiScore(mopsQuery(id)) },
  { name: 'ohlsonOScore', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateOhlsonOScore(mopsQuery(id)) },
  // valuation（psr/pFcf/evEbitda 需要 mops 財報，marketRatios 純市場資料）
  { name: 'psr', getCompanyIds: () => mopsIdsPromise, run: (id) => calculatePsr(mopsQuery(id)) },
  { name: 'pFcf', getCompanyIds: () => mopsIdsPromise, run: (id) => calculatePFcf(mopsQuery(id)) },
  { name: 'evEbitda', getCompanyIds: () => mopsIdsPromise, run: (id) => calculateEvEbitda(mopsQuery(id)) },
  { name: 'marketRatios', getCompanyIds: () => marketRatiosIdsPromise, run: (id) => calculateMarketRatios({ companyId: id }) },
  // portfolio + technicals（純市場資料）
  { name: 'beta', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateBeta({ companyId: id }) },
  { name: 'ma', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateMa({ companyId: id }) },
  { name: 'rsi', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateRsi({ companyId: id }) },
  { name: 'kd', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateKd({ companyId: id }) },
  { name: 'bollingerBands', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateBollingerBands({ companyId: id }) },
  { name: 'atr', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateAtr({ companyId: id }) },
  { name: 'bias', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateBiasIndicator({ companyId: id }) },
  { name: 'macd', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateMacd({ companyId: id }) },
  { name: 'obv', getCompanyIds: () => twsePriceIdsPromise, run: (id) => calculateObv({ companyId: id }) },
];

// 小併發，對齊現有 Prisma client 的 connection_limit=5 池大小設定，不要一次打爆連線池。
const CONCURRENCY = 5;

const runWithConcurrency = async (companyIds: string[], run: (id: string) => Promise<unknown>): Promise<{ success: number; failed: string[] }> => {
  let success = 0;
  const failed: string[] = [];
  let index = 0;

  const worker = async () => {
    while (index < companyIds.length) {
      const id = companyIds[index++]!;
      try {
        await run(id);
        success++;
      } catch (error) {
        failed.push(id);
        console.error(`  ✖ ${id}:`, error instanceof Error ? error.message : error);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, companyIds.length) }, worker));
  return { success, failed };
};

const main = async () => {
  console.log(`mops 公司清單：${(await mopsIdsPromise).length} 家`);
  console.log(`twse 股價公司清單：${(await twsePriceIdsPromise).length} 家`);
  console.log(`marketRatios 公司清單（twse+tpex 聯集）：${(await marketRatiosIdsPromise).length} 家`);
  console.log('---');

  for (const job of jobs) {
    const companyIds = await job.getCompanyIds();
    console.log(`[${job.name}] 開始，共 ${companyIds.length} 家公司`);
    const { success, failed } = await runWithConcurrency(companyIds, job.run);
    console.log(`[${job.name}] 完成：成功 ${success}，失敗 ${failed.length}${failed.length > 0 ? `（${failed.join(', ')}）` : ''}`);
  }

  await prisma.$disconnect();
  await twsePrisma.$disconnect();
  await tpexPrisma.$disconnect();
  await analysisPrisma.$disconnect();
};

main().catch((error) => {
  console.error('批次預算腳本執行失敗：', error);
  process.exit(1);
});
