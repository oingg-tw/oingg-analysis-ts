import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import type { HttpModule } from '@/http/module';

// 2026-09-05 起改成手動 registry——取代原本 swagger-jsdoc 直接讀 .ts 原始檔文字解析 JSDoc
// 註解的做法。每個模組各自的 openapi.ts 負責註冊自己的路徑（引用實際在用的 zod schema）。
// 2026-09-17 Phase 4：registry 不再是全服務共用的單例（以前每個 openapi.ts 都 import
// infrastructure/swagger/registry，是 http → infrastructure 的反向依賴，而且 import 時就註冊、
// 文件在 import 時就建好）——改成每次呼叫建一份新的 registry、依 httpModules 的順序註冊、產出文件；
// 契約測試不用連 DB 就能用同一份模組清單建 spec。
export const buildOpenApiDocument = (modules: readonly HttpModule[], { port }: { port: number }) => {
  const registry = new OpenAPIRegistry();
  for (const module of modules) module.registerOpenApi(registry);

  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'OINGG Ratios API',
      version: '1.0.0',
      description: 'API documentation for the OINGG financial-ratios service',
    },
    servers: [
      {
        url: `http://localhost:${port}`,
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
};
