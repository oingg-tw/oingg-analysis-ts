import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { businessCycleResultSchema, cpiResultSchema, gdpResultSchema, govBondYield10yHistoryResultSchema, monetaryAggregateResultSchema, usdTwdRateResultSchema } from '@/application/macro/series/types';
import { cpiQuerySchema, gdpQuerySchema, monthlySeriesQuerySchema, usdTwdRateQuerySchema } from './schemas';

const SOURCE_NOTE = '資料來源是 gov-ts 的 export view（央行／主計總處統計資料庫，gov-ts 每月 5 日重抓），本服務只讀、純轉發，不做交叉計算。';

export const registerMacroSeriesOpenApi = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'get',
    path: '/macro/business-cycle-indicator',
    summary: '景氣指標與景氣對策信號（月）',
    description: `國發會領先／同時／落後指標（綜合指數與不含趨勢指數）＋景氣對策信號綜合分數與燈號，1982-01 起。${SOURCE_NOTE}`,
    tags: ['Macro'],
    request: { query: monthlySeriesQuerySchema },
    responses: { 200: { description: '由舊到新，查無資料時 entries 是空陣列。', content: { 'application/json': { schema: businessCycleResultSchema } } } },
  });
  registry.registerPath({
    method: 'get',
    path: '/macro/monetary-aggregate',
    summary: '貨幣總計數 M1A／M1B／M2（月）',
    description: `央行日平均餘額（百萬新台幣）與年增率，1987-05 起（年增率前 12 個月為 null）。央行會修正近月數字，gov-ts 排程不覆寫、修正值需手動重建才會進來。${SOURCE_NOTE}`,
    tags: ['Macro'],
    request: { query: monthlySeriesQuerySchema },
    responses: { 200: { description: '由舊到新。', content: { 'application/json': { schema: monetaryAggregateResultSchema } } } },
  });
  registry.registerPath({
    method: 'get',
    path: '/macro/gov-bond-yield-10y-history',
    summary: '10 年期政府公債殖利率整段歷史（月）',
    description: `跟 /macro/gov-bond-yield-10y 同一張表（那支只回最新一筆），這支回 1994-01 起整段序列。${SOURCE_NOTE}`,
    tags: ['Macro'],
    request: { query: monthlySeriesQuerySchema },
    responses: { 200: { description: '由舊到新。', content: { 'application/json': { schema: govBondYield10yHistoryResultSchema } } } },
  });
  registry.registerPath({
    method: 'get',
    path: '/macro/usd-twd-rate',
    summary: '新台幣兌美元匯率（日）',
    description:
      '央行銀行買入／賣出／銀行間收盤三個匯率，1992-01 起。不是即時匯率：央行按月批次補、落後約一個月，前端請標明資料涵蓋到哪一天。' +
      `limit/interval 慣例跟 /market/taiex-daily-price 相同。${SOURCE_NOTE}`,
    tags: ['Macro'],
    request: { query: usdTwdRateQuerySchema },
    responses: { 200: { description: '由舊到新。', content: { 'application/json': { schema: usdTwdRateResultSchema } } } },
  });
  registry.registerPath({
    method: 'get',
    path: '/macro/cpi',
    summary: '消費者物價指數（月）',
    description: `總指數或七大類（category 參數），指數值與年增率，1981-01 起。${SOURCE_NOTE}`,
    tags: ['Macro'],
    request: { query: cpiQuerySchema },
    responses: { 200: { description: '由舊到新，回應帶回實際使用的 category。', content: { 'application/json': { schema: cpiResultSchema } } } },
  });
  registry.registerPath({
    method: 'get',
    path: '/macro/gdp',
    summary: '經濟成長率與需求面貢獻（季）',
    description: `category=growth_rate 的 contributionPoints 是經濟成長率本身（%），其餘 11 個 category 是國內需求／國外淨需求各項目對成長率的貢獻百分點（各項加總 = growth_rate），1981-Q1 起。${SOURCE_NOTE}`,
    tags: ['Macro'],
    request: { query: gdpQuerySchema },
    responses: { 200: { description: '由舊到新，回應帶回實際使用的 category。', content: { 'application/json': { schema: gdpResultSchema } } } },
  });
};
