import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { HttpModule } from '@/http/module';

// 2026-09-05 起改成手動 registry——取代原本 swagger-jsdoc 直接讀 .ts 原始檔文字解析 JSDoc
// 註解的做法。每個模組各自的 openapi.ts 負責註冊自己的路徑（引用實際在用的 zod schema）。
// 2026-09-17 Phase 4：registry 不再是全服務共用的單例（以前每個 openapi.ts 都 import
// infrastructure/swagger/registry，是 http → infrastructure 的反向依賴，而且 import 時就註冊、
// 文件在 import 時就建好）——改成每次呼叫建一份新的 registry、依 httpModules 的順序註冊、產出文件；
// 契約測試不用連 DB 就能用同一份模組清單建 spec。
//
// 2026-10-08 API 最佳實務第一批（跟 bff-ts／web-nuxt 一起定的）：
// - operationId 依「method ＋ path」自動產生（getCompaniesMetricHistory、getCompaniesSymbolMetricProvenance…），不靠逐支手寫，
//   不會漏；bff 拿 GET /openapi.json 進 CI 做 diff 時有穩定的鍵。路徑改了 operationId 跟著變，本來就是破壞性變更。
// - 安全宣告：X-Api-Key 是全域預設，public／batch／upstream 模組的路徑覆寫成不需要（它們掛在 bffAuth 之前，見 bootstrap/app.ts）。
const BFF_API_KEY_SCHEME = 'BffApiKey';

// 2026-10-08 RFC 9457 problem+json（見 http/problem.ts）：所有 4xx/5xx 都是這個形狀，形狀跟 bff-ts 的 Problem schema 一致。
// 每支端點宣告過的錯誤回應都引用它；另外補上 401（需要金鑰的端點）與 500（全部）。
const problemSchema = z
  .object({
    type: z.string().meta({
      example: 'tag:oingg.com,2026:unsupported-timeframe',
      description: '問題類別。有 code 的是由 code 推出的 tag URI（無法解析，RFC 9457 §3.1.1 允許），type 與 code 一一對應；沒有 code 的是 about:blank（意思不超出 HTTP 狀態碼）。',
    }),
    title: z.string().meta({ example: 'Bad Request', description: 'HTTP 狀態碼的標準短語，同一個 status 永遠相同。' }),
    status: z.number().int().meta({ example: 400, description: '等於 HTTP 回應的狀態碼。' }),
    detail: z.string().meta({ description: '給人看的說明，措辭不保證穩定，不要解析。' }),
    instance: z.string().meta({ example: 'urn:uuid:f47ac10b-58cc-4372-a567-0e02b2c3d479', description: '這次請求的 ID，跟 X-Request-Id header 同值（呼叫端有送 X-Request-Id 就沿用）。' }),
    code: z
      .enum(['unknown_metric', 'unsupported_timeframe'])
      .optional()
      .meta({ description: '只在呼叫端需要分支時才有：unknown_metric（metricCode 不存在）、unsupported_timeframe（這支指標不支援這個 timeframe）。之後可能新增值。' }),
    errors: z
      .array(z.object({ detail: z.string(), pointer: z.string().optional(), parameter: z.string().optional() }))
      .optional()
      .meta({
        description:
          '參數驗證失敗（400）時才有，RFC 9457 §3 的形狀：body 欄位用 pointer（URI fragment 形式的 JSON Pointer，例如 #/columns/0/field）；' +
          'query／path 參數用 parameter（例如 metricCode）。',
      }),
    message: z.string().meta({ description: '過渡期欄位（2026-10-08 前的舊格式）：驗證錯誤時是第一個欄位的錯誤訊息，其他錯誤等於 detail。呼叫端改讀 detail／errors 後會移除。' }),
  });


const operationIdOf = (method: string, path: string): string =>
  method +
  (path === '/' ? 'Root' : '') +
  path
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[{}]/g, '').replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase()))
    .join('');

export const buildOpenApiDocument = (modules: readonly HttpModule[], { port }: { port: number }) => {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', BFF_API_KEY_SCHEME, { type: 'apiKey', in: 'header', name: 'X-Api-Key' });
  // 專案其他 schema 都 inline、沒有擴充過 zod（registry.register 需要 extendZodWithOpenApi），共用元件改用 zod 4 內建轉換註冊。
  registry.registerComponent('schemas', 'Problem', z.toJSONSchema(problemSchema, { target: 'openapi-3.0' }) as Record<string, unknown>);
  // 哪些路徑不需要 X-Api-Key：記下每個非 bff 模組註冊了哪些路徑（registry.definitions 依註冊順序累加）。
  const publicRoutes = new Set<string>();
  for (const module of modules) {
    const before = registry.definitions.length;
    module.registerOpenApi(registry);
    if (module.auth === 'bff') continue;
    for (const def of registry.definitions.slice(before)) {
      if (def.type === 'route') publicRoutes.add(`${def.route.method} ${def.route.path}`);
    }
  }

  const generator = new OpenApiGeneratorV3(registry.definitions);
  const document = generator.generateDocument({
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
    security: [{ [BFF_API_KEY_SCHEME]: [] }],
    // 順序決定 Swagger UI 分組顯示的先後——2026-09-05 隨 zod-to-openapi 遷移一併校正，
    // 舊清單（Profitability/Cash Flow/Resilience/Turnover/Guru/Portfolio）是給已刪除的
    // 44 支單一指標端點用的分類，刪除後不再對應任何路徑；改成實際還在用的 tag。
    // 2026-10-08：/companies/* 從 System 拆出成 Companies；補宣告 Securities、Upstream（原本有用到但沒宣告）；
    // Industries、Macro 的說明跟著實際端點更新。
    tags: [
      { name: 'System', description: '伺服器狀態、指標目錄（GET /metrics）、證券清單、OpenAPI 文件、批次觸發' },
      { name: 'Companies', description: '單一公司：基本資料、各指標歷史、財報、徽章、溯源、河流圖等' },
      { name: 'Securities', description: '證券商（券商分點）清單' },
      { name: 'Industries', description: '證交所／櫃買中心產業類別與類股股利彙總' },
      { name: 'Stocks', description: '單一公司/批次股價、除權息預告' },
      { name: 'Screener', description: '多條件篩選、排行、指定股票批次查值（field 格式 "metricCode.timeframe"，見 GET /metrics）' },
      { name: 'Market', description: '全市場排行榜與清單類——注意股/處置股、成交量前20、漲跌停幅度、月營收/ETF 排行、重大訊息' },
      { name: 'Valuation', description: '估值排行——PER、PBR、股利殖利率（直接採用 oingg-twse/tpex 現成數字，不是本服務自己算的）' },
      { name: 'Macro', description: '總體經濟——股權風險溢酬、公債殖利率、政策利率、CPI、GDP、景氣燈號、匯率、貨幣總計數等' },
      { name: 'Upstream', description: '上游服務（mops-ts／tpex-ts／twse-ts）抓完資料後的變動通知' },
    ],
  });

  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = item[method];
      if (!operation) continue;
      operation.operationId ??= operationIdOf(method, path);
      // zod-to-openapi 的 route.path 是 {param} 寫法，跟 document.paths 的鍵一致。
      const isPublic = publicRoutes.has(`${method} ${path}`);
      if (isPublic) operation.security = [];
      const responses = operation.responses as Record<string, { description: string; content?: unknown }>;
      if (!isPublic) responses['401'] ??= { description: '沒帶或帶錯 X-Api-Key。' };
      responses['500'] ??= { description: '伺服器錯誤（正式環境 detail 是固定文字，用 instance 對 log）。' };
      for (const [code, response] of Object.entries(responses)) {
        if (Number(code) >= 400) response.content = { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } };
      }
    }
  }
  return document;
};
