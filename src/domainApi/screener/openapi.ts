import { registry } from '@/adapters/swagger/registry';
import { postScreenerBodySchema, getScreenerRankingQuerySchema, postScreenerValuesBodySchema } from './controller';
import { screenerResponseSchema, screenerRankingResponseSchema } from './types';

// runScreenerValues 回傳跟 runScreenerRanking 同一種形狀（{ results: ScreenerRow[] }），
// 見 src/domainApi/screener/service.ts，不需要另外定義一份 schema。
const screenerValuesResultSchema = screenerRankingResponseSchema;

export const registerScreenerOpenApi = (): void => {
  registry.registerPath({
    method: 'post',
    path: '/screener',
    summary: '依條件篩選股票，回傳分頁結果',
    description:
      '給 bff-ts 用，取代他們原本直連本服務 DB 跑動態 CTE/JOIN 的做法。field 一律是 "metricKey.fieldKey" 格式，' +
      '要能對到 GET /filters catalog 裡列出的欄位——查不到就整個請求回 400。filters 之間是 AND，篩選欄位缺資料' +
      '（值是 null，或 join 不到那張表）的公司整列排除；columns 只影響回應要不要帶那個欄位，缺資料時該欄位是 null 但公司仍在結果裡' +
      '（除非同一個欄位也出現在 filters 裡）。exclude=false（預設）保留落在 [min, max] 內的值，true 保留落在外面的值，' +
      'min/max 皆為 null 時 exclude:true 會篩掉全部——沒有邊界就沒有「外面」可言。每張被引用到的表都是「該公司最新一筆」' +
      '（季報類表格取合併報表、非子公司那一列，依 year/season 由新到舊排序；每日類表格依各自的日期欄位排序），' +
      '資料新鮮度是「最近一次批次算好的快照」，不是即時查詢。sortField/sortOrder：sortField 是 "symbol" 或已經列在 columns 裡的欄位，' +
      '兩者要嘛都給要嘛都不給。沒給時預設用 symbol 由小到大排序（保證分頁穩定，不是「沒有排序」）。不支援排公司名稱——' +
      'company_profile 跟本服務的分析用資料庫是完全獨立的另一個 Postgres 專案，screener 沒有跨資料庫 JOIN 的機制，' +
      '這個排序要在呼叫端（拿到結果、對照公司名稱之後）自己做。',
    tags: ['Screener'],
    request: { body: { content: { 'application/json': { schema: postScreenerBodySchema } } } },
    responses: {
      200: { description: '分頁結果，count 是全部符合條件的總筆數（不是這一頁的筆數）。', content: { 'application/json': { schema: screenerResponseSchema } } },
      400: { description: '請求格式錯誤，或 field 查不到對應的欄位。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/screener/ranking',
    summary: '依單一欄位排序，回傳前 N 名',
    description:
      '跟 POST /screener 共用同一套「latest row per symbol」查詢邏輯，差別是不分頁、依 field 排序取前 limit 名，' +
      'field 本身的值一定是 null 才會被排除（不需要另外用 filters 排除）。field 永遠會出現在回應的 values 裡（不用另外列進 columns），' +
      'columns 只是額外想順便帶出來的欄位，跟 POST /screener 的 columns 是同一種「缺資料就是 null，公司仍在結果裡」語意。',
    tags: ['Screener'],
    request: { query: getScreenerRankingQuerySchema },
    responses: {
      200: { description: '前 limit 名的結果，不分頁。', content: { 'application/json': { schema: screenerRankingResponseSchema } } },
      400: { description: '請求格式錯誤，或 field/columns 查不到對應的欄位。' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/screener/values',
    summary: '查詢明確列出的幾檔股票各自的欄位值',
    description:
      '給「畫面上已經有這幾檔股票，補一個新欄位」這種情境用，不是篩選查詢——symbols 是明確列出的清單（不是條件），' +
      '跟 GET /stocks/prices 同一種「這確切幾檔」的定位，一次最多 200 檔。跟 POST /screener 的關鍵差異：' +
      '這裡每個要求的 symbol 都保證出現在 results 裡，即使全部欄位都查無資料（values 會是空物件）——不會因為沒資料被拿掉，' +
      '畢竟呼叫端是先看到這些 symbol 才發出這個請求的，不該被靜默排除。values 裡個別欄位缺資料一樣是 null，跟 POST /screener 的 columns 同一種語意。',
    tags: ['Screener'],
    request: { body: { content: { 'application/json': { schema: postScreenerValuesBodySchema } } } },
    responses: {
      200: { description: '每個要求的 symbol 各一筆結果，不分頁、沒有 count。', content: { 'application/json': { schema: screenerValuesResultSchema } } },
      400: { description: '請求格式錯誤，symbols/columns 為空，或 columns 裡的 field 查不到對應的欄位。' },
    },
  });
};
