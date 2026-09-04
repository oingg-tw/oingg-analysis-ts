import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import swaggerUi from 'swagger-ui-express';
import { config } from '@/shared/config';
import { registry } from './registry';
import { registerCompaniesOpenApi } from '@/domainApi/companies/openapi';
import { registerStocksOpenApi } from '@/domainApi/stocks/openapi';
import { registerScreenerOpenApi } from '@/domainApi/screener/openapi';
import { registerFiltersOpenApi } from '@/domainApi/filter/openapi';
import { registerSystemOpenApi } from '@/domainApi/system/openapi';
import { registerBatchOpenApi } from '@/domainBatch/openapi';
import { registerValuationRankingOpenApi } from '@/domainApi/metrics/valuation/ranking/openapi';
import { registerEquityRiskPremiumOpenApi } from '@/domainApi/metrics/macro/equityRiskPremium/openapi';
import { registerGovBondYield10yOpenApi } from '@/domainApi/metrics/macro/govBondYield10y/openapi';
import { registerAttentionStocksOpenApi } from '@/domainApi/market/attentionStocks/openapi';
import { registerDisposedStocksOpenApi } from '@/domainApi/market/disposedStocks/openapi';
import { registerEtfRankingOpenApi } from '@/domainApi/market/etfRanking/openapi';
import { registerEtfScreenerOpenApi } from '@/domainApi/market/etfScreener/openapi';
import { registerForeignHoldingRankingOpenApi } from '@/domainApi/market/foreignHoldingRanking/openapi';
import { registerMarginShortRatioRankingOpenApi } from '@/domainApi/market/marginShortRatioRanking/openapi';
import { registerMaterialAnnouncementsOpenApi } from '@/domainApi/market/materialAnnouncements/openapi';
import { registerPriceChangeRankingOpenApi } from '@/domainApi/market/priceChangeRanking/openapi';
import { registerPriceLimitRangeOpenApi } from '@/domainApi/market/priceLimitRange/openapi';
import { registerRevenueRankingOpenApi } from '@/domainApi/market/revenueRanking/openapi';
import { registerVolumeTop20OpenApi } from '@/domainApi/market/volumeTop20/openapi';

// 2026-09-05 起改成手動 registry——取代原本 swagger-jsdoc 直接讀 .ts 原始檔文字解析 JSDoc
// 註解的做法。每個 domainApi 路由資料夾各自的 openapi.ts 負責註冊自己的路徑（引用實際在用的
// zod schema），這裡統一 import 並呼叫一次，是唯一知道「全部路由有哪些」的地方。
registerSystemOpenApi();
registerFiltersOpenApi();
registerCompaniesOpenApi();
registerStocksOpenApi();
registerScreenerOpenApi();
registerValuationRankingOpenApi();
registerEquityRiskPremiumOpenApi();
registerGovBondYield10yOpenApi();
registerAttentionStocksOpenApi();
registerDisposedStocksOpenApi();
registerEtfRankingOpenApi();
registerEtfScreenerOpenApi();
registerForeignHoldingRankingOpenApi();
registerMarginShortRatioRankingOpenApi();
registerMaterialAnnouncementsOpenApi();
registerPriceChangeRankingOpenApi();
registerPriceLimitRangeOpenApi();
registerRevenueRankingOpenApi();
registerVolumeTop20OpenApi();
registerBatchOpenApi();

const generator = new OpenApiGeneratorV3(registry.definitions);

export const swaggerSpec = generator.generateDocument({
  openapi: '3.0.0',
  info: {
    title: 'OINGG Ratios API',
    version: '1.0.0',
    description: 'API documentation for the OINGG financial-ratios service',
  },
  servers: [
    {
      url: `http://localhost:${config.port}`,
      description: 'Development server',
    },
  ],
  // 順序決定 Swagger UI 分組顯示的先後——2026-09-05 隨 zod-to-openapi 遷移一併校正，
  // 舊清單（Profitability/Cash Flow/Solvency/Turnover/Guru/Portfolio）是給已刪除的
  // 44 支單一指標端點用的分類，刪除後不再對應任何路徑；改成實際還在用的 tag。
  tags: [
    { name: 'System', description: '伺服器狀態與跨分類的系統性 API，例如可用 filter 分類/指標/欄位清單、單一公司基本資料' },
    { name: 'Stocks', description: '單一公司/批次股價、除權息預告' },
    { name: 'Screener', description: '多條件篩選、排行、指定股票批次查值' },
    { name: 'Market', description: '全市場排行榜與清單類——注意股/處置股、成交量前20、漲跌停幅度、月營收/ETF 排行、重大訊息' },
    { name: 'Valuation', description: '估值排行——PER、PBR、股利殖利率（直接採用 oingg-twse/tpex 現成數字，不是本服務自己算的）' },
    { name: 'Macro', description: '總體經濟——股權風險溢酬（ERP）、10 年期政府公債殖利率' },
  ],
});
export { swaggerUi };
