import { Router } from 'ultimate-express';
import batchRouter from './api/batch/route';
import rootRouter from './api/bff/system/root';
import metricsRouter from './api/bff/metrics/route';
import companiesRouter from './api/bff/companies/route';
import securitiesRouter from './api/bff/securities/route';
import preferredStockRouter from './api/bff/preferredStock/route';
import industriesRouter from './api/bff/industries/route';
import stocksRouter from './api/bff/stocks/route';
import screenerRouter from './api/bff/screener/route';
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
import rankingRouter from './api/bff/ranking/route';
import equityRiskPremiumRouter from './api/bff/macro/equityRiskPremium/route';
import govBondYield10yRouter from './api/bff/macro/govBondYield10y/route';
import { bffAuth } from './api/bff/bffAuth';

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

router.use(metricsRouter);
router.use(companiesRouter);
router.use(securitiesRouter);
router.use(preferredStockRouter);
router.use(industriesRouter);
router.use(stocksRouter);
router.use(screenerRouter);
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
// 端點；當時底層計算邏輯（domainMetrics/**/service.ts）暫時保留給 api/batch 批次跟
// companies/metrics 的 compute-on-miss 用，後續舊架構整批 DROP 時已經全數清空，見
// abstract-crafting-journal.md 的退場記錄——domainMetrics/ 這個資料夾本身也已經在
// 2026-09-09 完全刪除（唯一倖存的 ranking.ts 搬進 src/api/bff/ranking/
// calculateRanking.ts，跟它唯一的呼叫端放在一起；2026-09-10 ranking/macro 兩個模組
// 直接掛在 src/api/bff/ 底下，跟 companies/screener/stocks 等其他 BFF 模組同一層——
// 原本 metrics/valuation、metrics/macro、後來的 domains/ 這些巢狀資料夾都沒有實際
// 分類價值，拿掉；原本的 filter/ 資料夾也順勢改名 metrics/，因為它裝的正是
// GET /metrics 這支端點，跟現在已改名成 macro/ranking 的舊 metrics/ 資料夾不會再撞名）。
// ranking/equityRiskPremium/govBondYield10y 這三支語意不是「單一公司查詢」（見各自
// route.ts 的說明），繼續保留獨立端點。
// /securities/symbols（symbols-only 陣列，給 mops-ts 用）、/data-completeness（內部診斷
// 工具，不是對外契約）當時一併刪除。2026-09-11 應 web-nuxt 要求復活 /securities 命名空間，
// 但是完全不同的形狀（GET /securities，{symbol, companyName} 配對，分頁，見
// src/api/bff/securities/route.ts）——不是恢復舊的 symbols-only 版本，是给 searchbar 這類
// 需要涵蓋特別股的「證券」（跟「公司」是刻意分開的概念，見 companyProfile.ts 的
// listAllSecurityNames 說明）搜尋情境用的新端點。
const apiRouter = Router();
apiRouter.use('/valuation', rankingRouter);
apiRouter.use('/macro', equityRiskPremiumRouter, govBondYield10yRouter);

router.use(apiRouter);

export default router;
