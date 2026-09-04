import { registry } from '@/adapters/swagger/registry';
import { postEtfScreenerBodySchema } from './controller';
import { etfScreenerResponseSchema, etfFilterCatalogResponseSchema } from './types';

export const registerEtfScreenerOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/etf-screener/filters',
    summary: 'ETF screener 可篩選/顯示欄位目錄',
    description:
      '給前端動態畫篩選 UI 用，不用寫死欄位清單。kind: "numeric" 的欄位畫成最小值~最大值區間輸入；kind: "categorical" 的欄位畫成勾選清單，' +
      '選項直接來自 values——market/isActive/belowStatutoryThreshold 選項固定已知，assetClass/distributionFrequency 是現查資料庫的 distinct 值，' +
      '之後 sitca-ts 分類異動會直接反映在這支端點，不用改程式碼。',
    tags: ['Market'],
    responses: {
      200: { description: '欄位目錄。', content: { 'application/json': { schema: etfFilterCatalogResponseSchema } } },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/etf-screener',
    summary: 'ETF screener（多條件篩選 + 排序 + 分頁）',
    description:
      '資料來源是 sitca-ts 的 etf_basic_info/etf_monthly_statement/etf_performance（目前只有最新一個月的快照），欄位清單見 ' +
      'GET /etf-screener/filters。filters 有兩種形狀：數字欄位（aum/holders/netFlow/dcaAmount/marketShareRate/nav/return3m~return10y/' +
      'expenseRatio/statutoryAumThreshold）用 {field, min, max, exclude?}；類別欄位（market/assetClass/isActive/belowStatutoryThreshold/' +
      'distributionFrequency）用 {field, values: [...]}（IN 語意，屬於其中之一就保留）。isActive（是否為主動式 ETF）跟 ' +
      'belowStatutoryThreshold（規模是否低於法定下市門檻，下市風險近似警示）都是 sitca-ts 提供的權威欄位，不是本服務推算的。' +
      'exclude=false（預設）保留落在 [min,max] 內的值，null 一律排除；exclude=true 保留範圍外的值，min/max 都沒給時篩掉全部。' +
      'expenseRatio 只用「最新一個完整年度」，發行日在這個基準年（或更晚）的 ETF 那一年不滿一整年，這個欄位的值是 null' +
      '（不是整檔 ETF 被排除——screener 是列表瀏覽情境，跟 ranking 排行榜的「直接排除」不同）。sortField 不給就照 symbol 排序' +
      '（保證分頁穩定）；要排別的欄位，那個欄位要先出現在 columns 裡。',
    tags: ['Market'],
    request: { body: { content: { 'application/json': { schema: postEtfScreenerBodySchema } } } },
    responses: {
      200: { description: '分頁後的篩選結果。', content: { 'application/json': { schema: etfScreenerResponseSchema } } },
      400: { description: '請求格式錯誤，或 field 不是 GET /etf-screener/filters 列出的欄位。' },
    },
  });
};
