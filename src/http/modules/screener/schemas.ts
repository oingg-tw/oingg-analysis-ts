import { z } from 'zod';

// screener 系列端點的請求 schema——2026-09-17 Phase 4 從 controller.ts 搬來。CSV → 陣列的 transform 直接放在
// 匯出的 schema 上：zod-to-openapi 文件化的是 transform 前的輸入 schema（optional string），跟以前分兩份
// schema 時一模一樣。

const filterSchema = z.object({
  field: z.string().min(1),
  min: z.number().nullable(),
  max: z.number().nullable(),
  exclude: z.boolean().optional(),
});

const columnSchema = z.object({ field: z.string().min(1) });

export const postScreenerBodySchema = z.object({
  filters: z.array(filterSchema).default([]).meta({ description: '篩選條件之間是 AND，field 一定要能對到 GET /metrics 裡的 "metricCode.basis"' }),
  columns: z.array(columnSchema).default([]).meta({ description: '只影響回應要不要帶這個欄位，缺資料時是 null 但公司仍在結果裡' }),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  sortField: z.string().min(1).optional().meta({ description: '"symbol" 或已列在 columns 裡的欄位，兩者要嘛都給要嘛都不給，沒給預設用 symbol 排序' }),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  sectorCodes: z
    .array(z.string().min(1))
    .optional()
    .meta({
      description:
        '選填。證交所類股代碼（twse-ts/tpex-ts company_profile.industry，兩碼，例如 "24" 半導體業，' +
        '不是財政部稅籍分類），多個代碼是聯集（OR），跟 filters 是 AND 關係。合法代碼請查 ' +
        'GET /industries/securities-sectors，未分類的公司用類股篩選時會被排除。',
    }),
  excludeSectorCodes: z
    .array(z.string().min(1))
    .optional()
    .meta({
      description:
        '選填，2026-09-20 新增。排除這些證交所類股（例如「金融保險以外全部」），代碼體系同 sectorCodes，多個代碼是' +
        '聯集（OR）後整批排除。跟 sectorCodes 互斥，兩個都給會 400。查詢引擎原生用 NOT IN 實作，不是下游用' +
        '「全部類股減掉排除的」轉成 sectorCodes——那樣存成篩選範本後會把「排除金融」凍結成「包含這 34 個類股」，' +
        '之後新增的類股會被默默漏掉。未分類的公司不在任何類股裡，用 excludeSectorCodes 時會被保留（跟 sectorCodes 相反）。',
    }),
});

const splitCsv = (value: string): string[] => value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);

export const getScreenerRankingQuerySchema = z.object({
  field: z.string({ error: 'field is required.' }).min(1).meta({ example: 'roe.TTM' }),
  direction: z.enum(['asc', 'desc'], { error: 'direction is required.' }),
  limit: z.coerce.number().int().min(1).max(50).default(10).meta({ description: '預設 10，上限 50。' }),
  columns: z
    .string()
    .optional()
    .meta({ description: '逗號分隔的額外顯示欄位（"metricCode.basis" 格式）。' })
    .transform((value) => (value ? splitCsv(value) : [])),
  sectorCodes: z
    .string()
    .optional()
    .meta({ description: '逗號分隔的證交所類股代碼（多個是聯集），比照 POST /screener 的 sectorCodes，合法代碼查 GET /industries/securities-sectors。' })
    .transform((value) => (value ? splitCsv(value) : undefined)),
  excludeSectorCodes: z
    .string()
    .optional()
    .meta({ description: '2026-09-20 新增。逗號分隔的證交所類股代碼，整批排除，跟 sectorCodes 互斥（兩個都給會 400），語意同 POST /screener 的 excludeSectorCodes。' })
    .transform((value) => (value ? splitCsv(value) : undefined)),
});

// 2026-09-16 新增——查單一公司在全市場某個欄位的排名/百分位，跟 GET /screener/ranking
// （取前 N 名清單）是互補的兩種查詢，這支回答「這家公司自己排第幾」，不需要先知道
// 前 N 名是誰。
export const getCompanyRankQuerySchema = z.object({
  symbol: z.string({ error: 'symbol is required.' }).min(1).meta({ description: '公司代號', example: '2330' }),
  field: z.string({ error: 'field is required.' }).min(1).meta({ description: '"metricCode.basis" 格式，例如 "dividendYield.EOD"，可用組合見 GET /metrics', example: 'dividendYield.EOD' }),
  direction: z.enum(['asc', 'desc'], { error: 'direction is required.' }).meta({ description: 'desc：數值越高排名越前面（例如殖利率）；asc：數值越低排名越前面（例如本益比）' }),
  // 2026-09-24 修正：原本是 z.coerce.boolean()，**底層是 JS 的 Boolean(value)，query string 只要非空字串
  // （包含字面上的 "false" 和 "0"）一律轉成 true**——實測 excludeZero=false 與 excludeZero=0 都會排除 0 值，
  // 只有整個參數不存在或空字串才不排除。bff-ts 2026-09-24 回報：明確送 false 的呼叫端拿到跟要求相反的母體
  // （1445 而不是 1723），而且數字看起來完全合理、只是回答了另一個問題。
  // 更糟的是舊說明還寫著「true/false 或 1/0 皆可」——文件承諾了實作沒做到的事。
  // 這個陷阱本 repo 已經踩過兩次並留下警告（companies/schemas.ts 的 countOnly、securities/schemas.ts），
  // 只有 screener 這兩處沒跟上，現在統一成同樣的字串比對寫法。
  excludeZero: z
    .string()
    .optional()
    .meta({
      description:
        '排除值精確等於 0 的公司（不納入排名母體），預設 false。給殖利率這類「0 代表不配息，不是連續分布' +
        '裡的邊緣值」的欄位用，比照 GET /screener/distribution 的同名參數；混進一大群 0 會讓有配息公司的' +
        '排名/百分位失真。**只有字面上的 "true" 或 "1" 視為真**，其餘（含省略、"false"、"0"）一律為假。',
    })
    .transform((value) => value === 'true' || value === '1'),
});

// 2026-09-18 新增——全市場某個欄位的分布（直方圖）。bins 預設 20，上限 100（畫面上不會有
// 意義去切更細，且 width_bucket 每多一格就多一列 GROUP BY，沒必要放更寬）。
export const getScreenerDistributionQuerySchema = z.object({
  field: z.string({ error: 'field is required.' }).min(1).meta({ description: '"metricCode.timeframe" 格式，例如 "dividendYield.EOD"，可用組合見 GET /metrics', example: 'dividendYield.EOD' }),
  bins: z.coerce.number().int().min(5).max(100).default(20).meta({ description: '要切成幾格，預設 20，範圍 5~100。' }),
  // 同上面 company-rank 的 excludeZero，2026-09-24 一起從 z.coerce.boolean() 改成字串比對。
  excludeZero: z
    .string()
    .optional()
    .meta({
      description:
        '排除值精確等於 0 的列，預設 false（**只有 "true" 或 "1" 視為真**）。給殖利率這類「0 代表不適用這個概念（不配息），不是連續分布裡的' +
        '邊緣值」的欄位用——這類欄位常有一大塊列精確等於 0，混進分布會把整個圖壓在左邊界，看不出有意義' +
        '（非 0）那群的實際分布。',
    })
    .transform((value) => value === 'true' || value === '1'),
});

// bff-ts 一次最多送一頁的量（≤200），跟其他「明確列出清單」端點（GET /stocks/prices）同一種
// 上限慣例：超過直接 400，不會默默只處理前 200 筆。
const MAX_SYMBOLS = 200;

export const postScreenerValuesBodySchema = z.object({
  symbols: z
    .array(z.string().min(1))
    .min(1, 'symbols 至少要有一個公司代號。')
    .max(MAX_SYMBOLS, `symbols 一次最多 ${MAX_SYMBOLS} 檔，請分批查詢。`)
    .meta({ description: `明確列出的公司代號清單，不是篩選條件，一次最多 ${MAX_SYMBOLS} 檔。` }),
  columns: z.array(columnSchema).min(1, 'columns 至少要有一個欄位。'),
});
