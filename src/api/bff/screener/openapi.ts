import { z } from 'zod';
import { registry } from '@/adapters/swagger/registry';
import { postScreenerBodySchema, getScreenerRankingQuerySchema, postScreenerValuesBodySchema } from './controller';

// 2026-09-08 重建：field 格式從舊架構的 "metricKey.fieldKey" 改成 "metricCode.basis"（例如
// "roe.TTM"），對應 GET /metrics（metricFolderCatalog.ts）回傳的 metricCode/allowedBases。
// 查詢引擎直接讀 pitMetrics 共用的 metric_values 表，取「每個 symbol 最新一筆」（依
// fiscal_year/fiscal_quarter/knowledge_date 三欄排序），不分季報型/逐日型，兩種指標都吃
// 同一套邏輯。asOfDate 統一是 knowledge_date（YYYY-MM-DD），不再是舊架構的 ROC 年季字串。
const screenerValueSchema = z.object({
  value: z.number().nullable(),
  asOfDate: z.string().nullable().meta({ description: 'knowledge_date（YYYY-MM-DD），value 為 null 時也是 null' }),
});

const screenerRowSchema = z.object({
  symbol: z.string(),
  companyName: z.string().nullable(),
  values: z.record(z.string(), screenerValueSchema).meta({ description: 'key 是請求時的 "metricCode.basis"' }),
});

const screenerResultSchema = z.object({
  count: z.number().meta({ description: '符合條件的總筆數，不受 page/pageSize 影響' }),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
  results: z.array(screenerRowSchema),
});

const screenerRankingResultSchema = z.object({
  results: z.array(screenerRowSchema),
});

const screenerValuesResultSchema = z.object({
  results: z.array(screenerRowSchema),
});

export const registerScreenerOpenApi = (): void => {
  registry.registerPath({
    method: 'post',
    path: '/screener',
    summary: '多條件篩選（AND），分頁瀏覽',
    description:
      '篩選條件之間是 AND，field 格式 "metricCode.basis"（例如 "roe.TTM"），可用組合見 GET /metrics。' +
      '查詢引擎直接讀 pitMetrics 共用的 metric_values 表，取每個 symbol 目前已知的最新一筆值——' +
      '不是歷史查詢，只回傳「現在」，跟 GET /companies/metric-history（單一 symbol 的完整歷史時序）是不同用途。' +
      'exclude=false（預設）保留落在 [min,max] 內的值；exclude=true 保留落在 [min,max] 外的值，兩者 null 值一律排除。' +
      'columns 只影響回應要不要帶這個欄位，不影響篩選結果的 symbol 集合。sortField 是 "symbol" 或已列在 columns 裡的欄位。',
    tags: ['Screener'],
    request: { body: { content: { 'application/json': { schema: postScreenerBodySchema } } } },
    responses: {
      200: { description: '分頁後的篩選結果。', content: { 'application/json': { schema: screenerResultSchema } } },
      400: { description: 'filters/columns 都是空的、field 格式錯誤或查不到、sortField 不合法。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/screener/ranking',
    summary: '單一欄位排序取前 N 名',
    description: '排序欄位本身一定會出現在 values 裡（不管有沒有另外列進 columns），且保證非 null（WHERE value IS NOT NULL）。',
    tags: ['Screener'],
    request: { query: getScreenerRankingQuerySchema },
    responses: {
      200: { description: '依 field 排序的前 N 筆結果。', content: { 'application/json': { schema: screenerRankingResultSchema } } },
      400: { description: 'field 格式錯誤或查不到。' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/screener/values',
    summary: '指定股票清單批次查值',
    description:
      '給「已經在畫面上的這幾檔股票，補一個新欄位」這種情境用，不是篩選查詢——每個要求的 symbol 都保證出現在結果裡，' +
      '查不到資料的欄位是 null，不會因為沒資料整個 symbol 被拿掉。一次最多 200 檔。',
    tags: ['Screener'],
    request: { body: { content: { 'application/json': { schema: postScreenerValuesBodySchema } } } },
    responses: {
      200: { description: '每個要求的 symbol 都會出現。', content: { 'application/json': { schema: screenerValuesResultSchema } } },
      400: { description: 'symbols/columns 為空、超過上限，或 field 格式錯誤/查不到。' },
    },
  });
};
