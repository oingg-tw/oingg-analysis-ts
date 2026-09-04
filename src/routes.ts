import { Router } from 'ultimate-express';
import batchRouter from './api/batch/route';
import rootRouter from './api/bff/system/root';
import filtersRouter from './api/bff/filter/filters';
import companiesRouter from './api/bff/companies/route';
import stocksRouter from './api/bff/stocks/route';
import screenerRouter from './api/bff/screener/route';
import foreignHoldingRankingRouter from './api/bff/market/foreignHoldingRanking/route';
import marginShortRatioRankingRouter from './api/bff/market/marginShortRatioRanking/route';
import revenueRankingRouter from './api/bff/market/revenueRanking/route';
import volumeTop20Router from './api/bff/market/volumeTop20/route';
import disposedStocksRouter from './api/bff/market/disposedStocks/route';
import attentionStocksRouter from './api/bff/market/attentionStocks/route';
import priceLimitRangeRouter from './api/bff/market/priceLimitRange/route';
import materialAnnouncementsRouter from './api/bff/market/materialAnnouncements/route';
import priceChangeRankingRouter from './api/bff/market/priceChangeRanking/route';
import etfRankingRouter from './api/bff/market/etfRanking/route';
import etfScreenerRouter from './api/bff/market/etfScreener/route';
import rankingRouter from './api/bff/metrics/valuation/ranking/route';
import equityRiskPremiumRouter from './api/bff/metrics/macro/equityRiskPremium/route';
import govBondYield10yRouter from './api/bff/metrics/macro/govBondYield10y/route';
import { bffAuth } from './shared/bffAuth';

const router = Router();

// --- System Routes（不需要驗證）---
// 健康檢查給 Cloud Run/uptime 監控打，不能要求帶密鑰，否則監控系統也要知道這把密鑰。
router.use(rootRouter);

// --- Batch Routes（給 GCP Cloud Scheduler 用，不是 BFF）---
// 刻意放在 bffAuth 之前掛載，不套用 BFF 的共用密鑰——這支之後要接的是 Cloud Run IAM
// invoker（見 api/batch/daily/controller.ts、api/batch/quarterly/controller.ts 的說明），
// 是完全不同的信任邊界，不能共用同一把密鑰。
router.use(batchRouter);

// --- 以下都是只給 bff-ts 呼叫的 api/bff，2026-09-05 起套用共用密鑰驗證 ---
router.use(bffAuth);

router.use(filtersRouter);
router.use(companiesRouter);
router.use(stocksRouter);
router.use(screenerRouter);
router.use(foreignHoldingRankingRouter);
router.use(marginShortRatioRankingRouter);
router.use(revenueRankingRouter);
router.use(volumeTop20Router);
router.use(disposedStocksRouter);
router.use(attentionStocksRouter);
router.use(priceLimitRangeRouter);
router.use(materialAnnouncementsRouter);
router.use(priceChangeRankingRouter);
router.use(etfRankingRouter);
router.use(etfScreenerRouter);

// --- API Routes ---
// 2026-09-04：原本 44 支「單一公司單一指標」的舊端點（BFF 沒有呼叫過）已刪除，取代方式是
// GET /companies/metrics（見 src/api/bff/companies/route.ts）這支 consolidated 讀取優先
// 端點；底層計算邏輯（src/domainMetrics/**/service.ts）沒有刪，api/batch 批次跟
// companies/metrics 的 compute-on-miss 還是要用。ranking/equityRiskPremium/govBondYield10y
// 這三支語意不是「單一公司查詢」（見各自 route.ts 的說明），繼續保留獨立端點。
// /securities/symbols、/data-completeness 也一併刪除（前者使用者確認即使 mops-ts 有用也一併
// 砍掉，後者是內部診斷工具，不是對外契約）。
const apiRouter = Router();
apiRouter.use('/valuation', rankingRouter);
apiRouter.use('/macro', equityRiskPremiumRouter, govBondYield10yRouter);

router.use(apiRouter);

export default router;
