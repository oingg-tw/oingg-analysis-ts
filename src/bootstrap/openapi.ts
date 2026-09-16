import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import swaggerUi from 'swagger-ui-express';
import { config } from '@/infrastructure/config';
import { registry } from '../infrastructure/swagger/registry';
import { registerCompaniesOpenApi } from '@/http/modules/companies/openapi';
import { registerSecuritiesOpenApi } from '@/http/modules/securities/openapi';
import { registerPreferredStockOpenApi } from '@/http/modules/preferredStock/openapi';
import { registerIndustriesOpenApi } from '@/http/modules/industries/openapi';
import { registerStocksOpenApi } from '@/http/modules/stocks/openapi';
import { registerScreenerOpenApi } from '@/http/modules/screener/openapi';
import { registerFiltersOpenApi } from '@/http/modules/metrics/openapi';
import { registerSystemOpenApi } from '@/http/modules/system/openapi';
import { registerBatchOpenApi } from '@/http/batch/openapi';
import { registerValuationRankingOpenApi } from '@/http/modules/ranking/openapi';
import { registerEquityRiskPremiumOpenApi } from '@/http/modules/macro/equityRiskPremium/openapi';
import { registerGovBondYield10yOpenApi } from '@/http/modules/macro/govBondYield10y/openapi';
import { registerAttentionStocksOpenApi } from '@/http/modules/market/attentionStocks/openapi';
import { registerDisposedStocksOpenApi } from '@/http/modules/market/disposedStocks/openapi';
import { registerEtfRankingOpenApi } from '@/http/modules/market/etfRanking/openapi';
import { registerEtfScreenerOpenApi } from '@/http/modules/market/etfScreener/openapi';
import { registerMarginShortRatioRankingOpenApi } from '@/http/modules/market/marginShortRatioRanking/openapi';
import { registerMaterialAnnouncementsOpenApi } from '@/http/modules/market/materialAnnouncements/openapi';
import { registerPriceChangeRankingOpenApi } from '@/http/modules/market/priceChangeRanking/openapi';
import { registerPriceLimitRangeOpenApi } from '@/http/modules/market/priceLimitRange/openapi';
import { registerRevenueRankingOpenApi } from '@/http/modules/market/revenueRanking/openapi';
import { registerTaiexDailyPriceOpenApi } from '@/http/modules/market/taiexDailyPrice/openapi';
import { registerVolumeTop20OpenApi } from '@/http/modules/market/volumeTop20/openapi';

// 2026-09-05 起改成手動 registry——取代原本 swagger-jsdoc 直接讀 .ts 原始檔文字解析 JSDoc
// 註解的做法。每個 api/bff 路由資料夾各自的 openapi.ts 負責註冊自己的路徑（引用實際在用的
// zod schema），這裡統一 import 並呼叫一次，是唯一知道「全部路由有哪些」的地方。
registerSystemOpenApi();
registerFiltersOpenApi();
registerCompaniesOpenApi();
registerSecuritiesOpenApi();
registerPreferredStockOpenApi();
registerIndustriesOpenApi();
registerStocksOpenApi();
registerScreenerOpenApi();
registerValuationRankingOpenApi();
registerEquityRiskPremiumOpenApi();
registerGovBondYield10yOpenApi();
registerAttentionStocksOpenApi();
registerDisposedStocksOpenApi();
registerEtfRankingOpenApi();
registerEtfScreenerOpenApi();
registerMarginShortRatioRankingOpenApi();
registerMaterialAnnouncementsOpenApi();
registerPriceChangeRankingOpenApi();
registerPriceLimitRangeOpenApi();
registerRevenueRankingOpenApi();
registerTaiexDailyPriceOpenApi();
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
  // 舊清單（Profitability/Cash Flow/Resilience/Turnover/Guru/Portfolio）是給已刪除的
  // 44 支單一指標端點用的分類，刪除後不再對應任何路徑；改成實際還在用的 tag。
  tags: [
    { name: 'System', description: '伺服器狀態與跨分類的系統性 API，例如可用 filter 分類/指標/欄位清單、單一公司基本資料' },
    { name: 'Industries', description: '產業分類階層瀏覽（財政部稅籍五層分類 section/division/group/class/subclass）' },
    { name: 'Stocks', description: '單一公司/批次股價、除權息預告' },
    { name: 'Screener', description: '多條件篩選、排行、指定股票批次查值（field 格式 "metricCode.basis"，見 GET /metrics）' },
    { name: 'Market', description: '全市場排行榜與清單類——注意股/處置股、成交量前20、漲跌停幅度、月營收/ETF 排行、重大訊息' },
    { name: 'Valuation', description: '估值排行——PER、PBR、股利殖利率（直接採用 oingg-twse/tpex 現成數字，不是本服務自己算的）' },
    { name: 'Macro', description: '總體經濟——股權風險溢酬（ERP）、10 年期政府公債殖利率' },
  ],
});
export { swaggerUi };
