import type { HttpModule } from '@/http/module';
import type { AppDeps } from '@/application/deps';
import { getStartupTime } from './serverInfo';
import { createSystemRouter } from '@/http/modules/system/root';
import { registerSystemOpenApi } from '@/http/modules/system/openapi';
import { createBatchRouter } from '@/http/batch/route';
import { registerBatchOpenApi } from '@/http/batch/openapi';
import { createMetricsRouter } from '@/http/modules/metrics/route';
import { registerFiltersOpenApi } from '@/http/modules/metrics/openapi';
import { createCompaniesRouter } from '@/http/modules/companies/route';
import { registerCompaniesOpenApi } from '@/http/modules/companies/openapi';
import { createSecuritiesRouter } from '@/http/modules/securities/route';
import { registerSecuritiesOpenApi } from '@/http/modules/securities/openapi';
import { createPreferredStockRouter } from '@/http/modules/preferredStock/route';
import { registerPreferredStockOpenApi } from '@/http/modules/preferredStock/openapi';
import { createIndustriesRouter } from '@/http/modules/industries/route';
import { registerIndustriesOpenApi } from '@/http/modules/industries/openapi';
import { createStocksRouter } from '@/http/modules/stocks/route';
import { registerStocksOpenApi } from '@/http/modules/stocks/openapi';
import { createScreenerRouter } from '@/http/modules/screener/route';
import { registerScreenerOpenApi } from '@/http/modules/screener/openapi';
import { createMarginShortRatioRankingRouter } from '@/http/modules/market/marginShortRatioRanking/route';
import { registerMarginShortRatioRankingOpenApi } from '@/http/modules/market/marginShortRatioRanking/openapi';
import { createRevenueRankingRouter } from '@/http/modules/market/revenueRanking/route';
import { registerRevenueRankingOpenApi } from '@/http/modules/market/revenueRanking/openapi';
import { createVolumeTop20Router } from '@/http/modules/market/volumeTop20/route';
import { registerVolumeTop20OpenApi } from '@/http/modules/market/volumeTop20/openapi';
import { createDisposedStocksRouter } from '@/http/modules/market/disposedStocks/route';
import { registerDisposedStocksOpenApi } from '@/http/modules/market/disposedStocks/openapi';
import { createAttentionStocksRouter } from '@/http/modules/market/attentionStocks/route';
import { registerAttentionStocksOpenApi } from '@/http/modules/market/attentionStocks/openapi';
import { createPriceLimitRangeRouter } from '@/http/modules/market/priceLimitRange/route';
import { registerPriceLimitRangeOpenApi } from '@/http/modules/market/priceLimitRange/openapi';
import { createMaterialAnnouncementsRouter } from '@/http/modules/market/materialAnnouncements/route';
import { registerMaterialAnnouncementsOpenApi } from '@/http/modules/market/materialAnnouncements/openapi';
import { createPriceChangeRankingRouter } from '@/http/modules/market/priceChangeRanking/route';
import { registerPriceChangeRankingOpenApi } from '@/http/modules/market/priceChangeRanking/openapi';
import { createEtfRankingRouter } from '@/http/modules/market/etfRanking/route';
import { registerEtfRankingOpenApi } from '@/http/modules/market/etfRanking/openapi';
import { createEtfScreenerRouter } from '@/http/modules/market/etfScreener/route';
import { registerEtfScreenerOpenApi } from '@/http/modules/market/etfScreener/openapi';
import { createTaiexDailyPriceRouter } from '@/http/modules/market/taiexDailyPrice/route';
import { registerTaiexDailyPriceOpenApi } from '@/http/modules/market/taiexDailyPrice/openapi';
import { createRankingRouter } from '@/http/modules/ranking/route';
import { registerValuationRankingOpenApi } from '@/http/modules/ranking/openapi';
import { createEquityRiskPremiumRouter } from '@/http/modules/macro/equityRiskPremium/route';
import { registerEquityRiskPremiumOpenApi } from '@/http/modules/macro/equityRiskPremium/openapi';
import { createGovBondYield10yRouter } from '@/http/modules/macro/govBondYield10y/route';
import { registerGovBondYield10yOpenApi } from '@/http/modules/macro/govBondYield10y/openapi';
import { createCbcPolicyRateRouter } from '@/http/modules/macro/cbcPolicyRate/route';
import { registerCbcPolicyRateOpenApi } from '@/http/modules/macro/cbcPolicyRate/openapi';
import { createMacroSeriesRouter } from '@/http/modules/macro/series/route';
import { registerMacroSeriesOpenApi } from '@/http/modules/macro/series/openapi';

// 2026-09-17 clean architecture 重構 Phase 4：**唯一**知道「全部路由有哪些」的地方——取代 src/http/routes.ts
// （掛載順序）跟舊 src/bootstrap/openapi.ts（文件註冊順序）兩份手動同步的清單。createApp 依 auth 分組、
// 依這裡的順序掛載（順序沿用舊 routes.ts）；buildOpenApiDocument 依同一個順序註冊 OpenAPI 路徑
// （tests/contract/openapi.test.ts 的 snapshot 有 deep key-sort，註冊順序不是契約）。
//
// 掛載細節：public 先、batch 次之（都在 bffAuth 之前），再 bffAuth，最後 bff 模組；有 mountPath 的掛在前綴下
// （ranking 的 route 是 /ranking，對外是 /valuation/ranking；macro 兩支同理）。
//
// 新增端點：在對應模組的 route.ts/openapi.ts 加，然後在這裡加一筆——只有一個地方要改。
//
// Phase 4-3 起每個模組都是 createXxxRouter(deps) 工廠（薄 controller + application use case），這裡是唯一把
// deps 交給 http 層的地方。
export const createHttpModules = (deps: AppDeps): readonly HttpModule[] => [
  { name: 'system', auth: 'public', router: createSystemRouter({ getStartupTime }), registerOpenApi: registerSystemOpenApi },
  { name: 'batch', auth: 'batch', router: createBatchRouter(deps), registerOpenApi: registerBatchOpenApi },
  { name: 'metrics', auth: 'bff', router: createMetricsRouter(), registerOpenApi: registerFiltersOpenApi },
  { name: 'companies', auth: 'bff', router: createCompaniesRouter(deps), registerOpenApi: registerCompaniesOpenApi },
  { name: 'securities', auth: 'bff', router: createSecuritiesRouter(deps), registerOpenApi: registerSecuritiesOpenApi },
  { name: 'preferredStock', auth: 'bff', router: createPreferredStockRouter(deps), registerOpenApi: registerPreferredStockOpenApi },
  { name: 'industries', auth: 'bff', router: createIndustriesRouter(deps), registerOpenApi: registerIndustriesOpenApi },
  { name: 'stocks', auth: 'bff', router: createStocksRouter(deps), registerOpenApi: registerStocksOpenApi },
  { name: 'screener', auth: 'bff', router: createScreenerRouter(deps), registerOpenApi: registerScreenerOpenApi },
  { name: 'marginShortRatioRanking', auth: 'bff', router: createMarginShortRatioRankingRouter(deps), registerOpenApi: registerMarginShortRatioRankingOpenApi },
  { name: 'revenueRanking', auth: 'bff', router: createRevenueRankingRouter(deps), registerOpenApi: registerRevenueRankingOpenApi },
  { name: 'volumeTop20', auth: 'bff', router: createVolumeTop20Router(deps), registerOpenApi: registerVolumeTop20OpenApi },
  { name: 'disposedStocks', auth: 'bff', router: createDisposedStocksRouter(deps), registerOpenApi: registerDisposedStocksOpenApi },
  { name: 'attentionStocks', auth: 'bff', router: createAttentionStocksRouter(deps), registerOpenApi: registerAttentionStocksOpenApi },
  { name: 'priceLimitRange', auth: 'bff', router: createPriceLimitRangeRouter(deps), registerOpenApi: registerPriceLimitRangeOpenApi },
  { name: 'materialAnnouncements', auth: 'bff', router: createMaterialAnnouncementsRouter(deps), registerOpenApi: registerMaterialAnnouncementsOpenApi },
  { name: 'priceChangeRanking', auth: 'bff', router: createPriceChangeRankingRouter(deps), registerOpenApi: registerPriceChangeRankingOpenApi },
  { name: 'etfRanking', auth: 'bff', router: createEtfRankingRouter(deps), registerOpenApi: registerEtfRankingOpenApi },
  { name: 'etfScreener', auth: 'bff', router: createEtfScreenerRouter(deps), registerOpenApi: registerEtfScreenerOpenApi },
  { name: 'taiexDailyPrice', auth: 'bff', router: createTaiexDailyPriceRouter(deps), registerOpenApi: registerTaiexDailyPriceOpenApi },
  { name: 'valuationRanking', auth: 'bff', mountPath: '/valuation', router: createRankingRouter(deps), registerOpenApi: registerValuationRankingOpenApi },
  { name: 'equityRiskPremium', auth: 'bff', mountPath: '/macro', router: createEquityRiskPremiumRouter(deps), registerOpenApi: registerEquityRiskPremiumOpenApi },
  { name: 'govBondYield10y', auth: 'bff', mountPath: '/macro', router: createGovBondYield10yRouter(deps), registerOpenApi: registerGovBondYield10yOpenApi },
  { name: 'cbcPolicyRate', auth: 'bff', mountPath: '/macro', router: createCbcPolicyRateRouter(deps), registerOpenApi: registerCbcPolicyRateOpenApi },
  { name: 'macroSeries', auth: 'bff', mountPath: '/macro', router: createMacroSeriesRouter(deps), registerOpenApi: registerMacroSeriesOpenApi },
];
