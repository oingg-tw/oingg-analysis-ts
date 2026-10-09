import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  getSectorMetricHistoryQuerySchema,
  getSectorMonthlyRevenueHistoryQuerySchema,
  getSectorSummaryQuerySchema,
  sectorDividendSummaryResultSchema,
  sectorMetricHistoryResultSchema,
  sectorMonthlyRevenueHistoryResultSchema,
  sectorParamsSchema,
  sectorSummaryResultSchema,
  securitiesIndustrySectorsResultSchema,
} from './types';

export const registerIndustriesOpenApi = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'get',
    path: '/industries/securities-sectors',
    summary: '證交所類股分類清單（投資人習慣的「半導體業」等類股，非財政部稅籍分類）',
    description:
      '資料源是 twse-ts/tpex-ts 的 company_profile.industry 欄位（證交所公告的類股分類，兩碼代碼），' +
      '這支是「半導體業」' +
      '「電子零組件業」這類投資人熟悉的類股名稱。只有單一層級，扁平回傳有公司的代碼（排除' +
      '證券商/期貨商/第一上市外國公司身份別/舊產業代碼殘留這幾個非真正產業分類的代碼，以及目前 0 家的代碼）。' +
      'companyCount = 用這個代碼在 screener 篩得到幾家：母體跟 GET /companies 相同（上市＋上櫃＋興櫃，不含公開發行未上市），' +
      '轉板公司只算一次，所以各類股加總等於 GET /companies 裡有類股的公司數。screener 的 POST /screener、' +
      'GET /screener/ranking 的 sectorCodes 參數用的就是這支端點回傳的代碼；不在清單上但仍屬合法代碼的（例如 0 家的舊分類）照樣接受、篩出 0 家。',
    tags: ['Industries'],
    responses: {
      200: { description: '全部合法證交所類股代碼清單。', content: { 'application/json': { schema: securitiesIndustrySectorsResultSchema } } },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/industries/sector-dividend-summary',
    summary: '各證交所類股的殖利率與股利 3 年成長率彙總（產業分析散佈圖用）',
    description:
      '每個類股一列，給「Y 軸殖利率、X 軸股利成長率」的產業散佈圖用。類股代碼與名稱同 GET /industries/securities-sectors；' +
      '母體是上市＋上櫃公司（不含興櫃），每家取各自最新一筆值再按類股彙總。\n\n' +
      '每一軸都同時給平均數（mean）與中位數（median）：成長率有極端值（基期很小的公司 CAGR 可以上百 %），平均數會被少數公司拉走，' +
      '中位數比較能代表類股；兩個都給，前端自行挑。count 是那一軸有值的公司數，樣本很少的類股（例如個位數）點的位置不穩定，' +
      '建議在圖上標出 count 或淡化；兩軸的 count 通常不同，一個點的 X 與 Y 是對不同的公司子集合算的（例如成長率常只有六成公司有值）。\n\n' +
      '殖利率：交易所每日公布值（dividendYield.EOD），只收最新交易日往前 14 天內的值（停牌、下市前的舊值不算現況）；' +
      '0（沒配息）照算進去，因為那是類股真實樣貌的一部分。成長率：dividendGrowthRate3y.FY，基期沒配息或歷史不足的公司沒有值、不計入。' +
      '個別類股內每家公司的數值請用 POST /screener 帶 sectorCodes 與這兩個 field 查。',
    tags: ['Industries'],
    responses: {
      200: { description: '每個類股的兩軸彙總。', content: { 'application/json': { schema: sectorDividendSummaryResultSchema } } },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/industries/{sectorCode}/metric-history',
    summary: '類股指標逐期四分位（中位數、q1、q3、家數）',
    description:
      '每一期只用「那一期」各公司的值算中位數與四分位，不是各公司最新一期混在一起。只支援季報型、非每股類的指標' +
      '（每股數字取決於各家股數，跨公司取中位數沒有意義；逐日型與月頻指標回 400）。' +
      'count 是那一期有值的公司數；count 為 0 時 median／q1／q3 為 null，nullReason 是那一期最多公司的原因' +
      '（例如金融業不適用的指標是 not_applicable_industry）。金融保險類股的營收類與三率只有部分公司有值' +
      '（銀行、票券、產險、保經等；金控不適用），那一類的中位數只代表有值的這些公司，請看 count。\n\n類股成員是「今天的分類」：母體為上市＋上櫃、有類股代碼的公司（不含興櫃）；已下市公司不在名單內，所以較早的期別是「現存公司的歷史」，不是當年類股的全貌。',
    tags: ['Industries'],
    request: { params: sectorParamsSchema, query: getSectorMetricHistoryQuerySchema },
    responses: {
      200: { description: '逐期四分位，由舊到新。', content: { 'application/json': { schema: sectorMetricHistoryResultSchema } } },
      400: { description: 'metricCode／timeframe 不合法，或不是季報型、是每股類指標。' },
      404: { description: '查無這個類股代碼的上市櫃公司。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/industries/{sectorCode}/monthly-revenue-history',
    summary: '類股月營收合計與年增率（同一批公司口徑）',
    description:
      '每個月只加總「當月有營收、去年同月營收大於 0」的公司，revenue 與 lastYearRevenue 都是這一批的合計，' +
      'companyCount 是這一批的家數；這樣新上市、下市不會讓年增率跳動。去年同月營收用公司當月申報裡自帶的比較數字。' +
      '金額是新台幣千元、字串。資料從 2021-09 開始（上市與上櫃的月營收）。\n\n類股成員是「今天的分類」：母體為上市＋上櫃、有類股代碼的公司（不含興櫃）；已下市公司不在名單內，所以較早的期別是「現存公司的歷史」，不是當年類股的全貌。',
    tags: ['Industries'],
    request: { params: sectorParamsSchema, query: getSectorMonthlyRevenueHistoryQuerySchema },
    responses: {
      200: { description: '逐月合計，由舊到新。', content: { 'application/json': { schema: sectorMonthlyRevenueHistoryResultSchema } } },
      404: { description: '查無這個類股代碼的上市櫃公司。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/industries/sector-summary',
    summary: '各類股多個欄位的四分位彙總（最新快照）',
    description:
      '每個類股一列，每個請求的欄位給 count／median／q1／q3。每家公司取各自最新一筆（跟 screener 同一套查詢），' +
      '所以是各公司最新一期混在一起的快照，不是同一期的比較；要同一期請用 GET /industries/{sectorCode}/metric-history。' +
      '母體是上市＋上櫃、有類股代碼的公司（不含興櫃）。',
    tags: ['Industries'],
    request: { query: getSectorSummaryQuerySchema },
    responses: {
      200: { description: '每個類股每個欄位的四分位。', content: { 'application/json': { schema: sectorSummaryResultSchema } } },
      400: { description: 'fields 為空、超過上限或有不合法的欄位。' },
    },
  });
};
