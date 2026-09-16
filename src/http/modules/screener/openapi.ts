import { z } from 'zod';
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { postScreenerBodySchema, getScreenerRankingQuerySchema, postScreenerValuesBodySchema, getCompanyRankQuerySchema } from './schemas';

// 2026-09-08 重建：field 格式從舊架構的 "metricKey.fieldKey" 改成 "metricCode.basis"（例如
// "roe.TTM"），對應 GET /metrics（metricFolderCatalog.ts）回傳的 metricCode/allowedBases。
// 查詢引擎直接讀 pitMetrics 共用的 metric_values 表，取「每個 symbol 最新一筆」（依
// fiscal_year/fiscal_quarter/knowledge_date 三欄排序），不分季報型/逐日型，兩種指標都吃
// 同一套邏輯。knowledgeDate 統一是 knowledge_date（YYYY-MM-DD），不再是舊架構的 ROC 年季字串。
// 2026-09-13 兩個破壞性變更：
// (1) 欄位改名 asOfDate → knowledgeDate——跟其餘 PIT 端點（metric-history 等）統一用語，
//     也避免跟專案裡「asOfDate 當查詢輸入參數」的既有用法（getStockPriceAsOf 等）撞名——
//     這裡存的其實是「這個算出來的值哪天才被市場知道（公告日）」，跟「這個值在哪個日期
//     生效」是不同問題，見 src/domainPitMetrics/knowledgeDate.ts 的說明。
// (2) 補上 nullReason——原本只有 value/asOfDate，前端（徽章卡片）拿到 value:null
//     時無法分辨「不適用（產業別排除）」跟其他情況，只能顯示籠統的「尚無資料」，跟
//     GET /companies/metric-history（本來就有 nullReason）不一致。查無這一列（symbol 從沒
//     被算過這支指標）時 nullReason 也是 null，跟「算過但為 null」在這層無法區分，需要精確
//     分辨請改查 metric-history。
const screenerValueSchema = z.object({
  value: z.number().nullable(),
  knowledgeDate: z.string().nullable().meta({ description: 'knowledge_date（YYYY-MM-DD）——這個值哪天被市場公告知道，不是財報期末日；value 為 null 時也是 null' }),
  nullReason: z
    .enum(['missing_input', 'zero_or_negative_denominator', 'not_applicable_industry', 'insufficient_history'])
    .nullable()
    .meta({ description: 'value 為 null 時的原因；value 非 null 時一律是 null；查無此列（從沒被算過）時也是 null' }),
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

const companyRankResultSchema = z.object({
  symbol: z.string(),
  field: z.string(),
  found: z.boolean().meta({ description: 'false 代表這家公司這個欄位查無資料（從沒被算過或算出來是 null），此時 rank/totalCount/topPercent/value 皆為 null' }),
  value: z.number().nullable(),
  rank: z.number().int().nullable().meta({ description: '1-based，並列名次共用同一個名次（RANK() 語意，不是連續序號）' }),
  totalCount: z.number().int().nullable().meta({ description: '全市場這個欄位有值（非 null）的公司總數' }),
  topPercent: z.number().nullable().meta({ description: 'rank÷totalCount×100，四捨五入到小數點後一位。數字越小代表排名越前面，例如 5 代表排在全市場前 5%（不是「百分位」那種越高越好的敘述方向，刻意選這個命名貼近「贏過前 X%」的中文口語問法）' }),
});

export const registerScreenerOpenApi = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'post',
    path: '/screener',
    summary: '多條件篩選（AND），分頁瀏覽',
    description:
      '篩選條件之間是 AND，field 格式 "metricCode.basis"（例如 "roe.TTM"），可用組合見 GET /metrics。' +
      '查詢引擎直接讀 pitMetrics 共用的 metric_values 表，取每個 symbol 目前已知的最新一筆值——' +
      '不是歷史查詢，只回傳「現在」，跟 GET /companies/metric-history（單一 symbol 的完整歷史時序）是不同用途。' +
      'exclude=false（預設）保留落在 [min,max] 內的值；exclude=true 保留落在 [min,max] 外的值，兩者 null 值一律排除。' +
      'columns 只影響回應要不要帶這個欄位，不影響篩選結果的 symbol 集合。sortField 是 "symbol" 或已列在 columns 裡的欄位。' +
      '2026-09-11 新增 sectorCodes（選填）：證交所類股代碼（twse-ts/tpex-ts company_profile.industry，' +
      '兩碼，例如「24」半導體業，不是財政部稅籍分類），多個代碼是聯集，跟 filters 是 AND 關係，用來先縮小候選' +
      '公司範圍再套用數字篩選（例如「半導體業 + ROE > 15%」）。合法代碼請查 GET /industries/securities-sectors，' +
      '未分類的公司用類股篩選時會被排除，不是 bug，是資料源本身的已知限制。',
    tags: ['Screener'],
    request: { body: { content: { 'application/json': { schema: postScreenerBodySchema } } } },
    responses: {
      200: { description: '分頁後的篩選結果。', content: { 'application/json': { schema: screenerResultSchema } } },
      400: { description: 'filters/columns 都是空的、field 格式錯誤或查不到、sortField 不合法、sectorCodes 有不合法的代碼。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/screener/ranking',
    summary: '單一欄位排序取前 N 名',
    description:
      '排序欄位本身一定會出現在 values 裡（不管有沒有另外列進 columns），且保證非 null（WHERE value IS NOT NULL）。' +
      'sectorCodes（選填，逗號分隔）比照 POST /screener 同一套證交所類股篩選語意，先縮小候選公司範圍再排序。',
    tags: ['Screener'],
    request: { query: getScreenerRankingQuerySchema },
    responses: {
      200: { description: '依 field 排序的前 N 筆結果。', content: { 'application/json': { schema: screenerRankingResultSchema } } },
      400: { description: 'field 格式錯誤或查不到、sectorCodes 有不合法的代碼。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/screener/company-rank',
    summary: '單一公司在全市場某個欄位的排名/百分位',
    description:
      '跟 GET /screener/ranking（取前 N 名清單）是互補的兩種查詢，這支回答「這家公司自己排第幾、' +
      '贏過全市場前百分之多少」，不需要先知道前 N 名是誰，也不用自己抓全市場清單再數名次——' +
      'rank/totalCount 是在同一次查詢裡用 window function 對全市場一次算完，只回傳目標 symbol 那一列。' +
      'direction=desc：數值越高排名越前面（例如殖利率）；direction=asc：數值越低排名越前面（例如本益比）。' +
      'totalCount 只計入這個欄位有值（非 null）的公司；並列數值共用同一個名次（RANK() 語意）。' +
      'topPercent 是 rank÷totalCount×100（四捨五入到小數點後一位），數字越小代表排名越前面，' +
      '例如 5 代表排在全市場前 5%——跟「百分位」是相反的敘述方向（百分位越高代表越好），' +
      '刻意選這個命名貼近「贏過前 X%」的中文口語問法。found:false 代表這家公司這個欄位查無資料' +
      '（從沒被算過，或算出來是 null），此時 value/rank/totalCount/topPercent 皆為 null。',
    tags: ['Screener'],
    request: { query: getCompanyRankQuerySchema },
    responses: {
      200: { description: '該公司在此欄位的排名/百分位（或 found:false）。', content: { 'application/json': { schema: companyRankResultSchema } } },
      400: { description: 'symbol 為空、field 格式錯誤或查不到、direction 不合法。' },
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
