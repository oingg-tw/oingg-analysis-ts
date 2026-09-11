import { registry } from '@/adapters/swagger/registry';
import { postEtfScreenerBodySchema } from './controller';
import { etfScreenerResponseSchema, etfFilterCatalogResponseSchema } from './types';

export const registerEtfScreenerOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/etf-screener/filters',
    summary: 'ETF screener 可篩選/顯示欄位目錄（指標選單）',
    description:
      '給前端動態畫篩選 UI 用，不用寫死欄位清單。2026-09-11 起比照股票 GET /filters，回應是巢狀分類' +
      '（categories: [{categoryKey, categoryDisplayName, fields: [...]}]）——身分分類/規模與資金/淨值與市價/績效表現/成本費用共 5 組，' +
      '不再是扁平陣列（breaking change）。每個 field 帶 unit（只有 numeric 才有，例如 "元"/"%"/"人"）。' +
      'kind: "numeric" 的欄位畫成最小值~最大值區間輸入；kind: "date"（目前只有 establishedDate）畫成日期範圍輸入，min/max 是 "YYYY-MM-DD" 字串；' +
      'kind: "categorical" 的欄位畫成勾選清單，選項直接來自 values——market/isActive/belowStatutoryThreshold 選項固定已知，' +
      'assetClass/distributionFrequency 是現查資料庫的 distinct 值，之後 sitca-ts 分類異動會直接反映在這支端點，不用改程式碼。',
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
      '（不是整檔 ETF 被排除——screener 是列表瀏覽情境，跟 ranking 排行榜的「直接排除」不同）。' +
      'expenseRatio2001~expenseRatio2026（2026-09-08 新增，共 26 個獨立數字欄位，見 GET /etf-screener/filters）' +
      '是分年度總費用率，給前端橫向比較歷年費用率變化用——資料源跟 expenseRatio 不同：這裡用 sitca-ts 已經濾掉' +
      '不完整期間資料的 fund_expense_ratio_annual_full_year，逐檔逐年判斷該年是否為完整年度，比 expenseRatio' +
      '單純套「calendar year - 1」精確；某年份沒有值（基金那年還沒成立、或該年資料不完整）該年欄位是 null，' +
      '不影響其他年份。' +
      'establishedDate（2026-09-08 新增）是日期欄位，filter 用 {field, min, max, exclude?}，min/max 是 "YYYY-MM-DD" ' +
      '字串（跟數字欄位同一套 exclude 語意）。' +
      'managementFeeRate/custodianFeeRate/guaranteeFeeRate/otherFeeRate/commissionRate/transactionTaxRate/' +
      'etfTradingFeeRate（2026-09-08 新增）是費用率細項拆分，只取「該基金自己最新一筆完整年度」（跟 expenseRatio 同一種' +
      '「目前」語意，不是分年度系列），資料源是 fund_expense_ratio_annual_full_year，用該基金最新一筆完整年度資料，' +
      '不是全體套同一個基準年——所以不同基金即使欄位都有值，對應的年度可能不一樣，這是刻意的設計（比全體套同一個基準年' +
      '精確，代價是欄位本身不標註是哪一年，需要的話搭配 expenseRatio2001~2026 的分年度序列自己比對）。' +
      'premiumDiscountPct（2026-09-10 新增）是折溢價率 = (市價-淨值)/淨值*100，正值溢價、負值折價，取「淨值跟市價' +
      '同一天都有資料」的最新一天，不是各自抓各自的最新一天硬湊。資料源是 sitca-ts 的逐日淨值 + twse-ts/tpex-ts push' +
      '的逐日市價，市價回填深度比淨值淺很多（上市 2020-11 起、上櫃 2021-09 起），且市價還在持續回填中，目前只有部分' +
      'ETF 有值，沒有值的是 null（不是 0）。' +
      'sortField 不給就照 symbol 排序' +
      '（保證分頁穩定）；要排別的欄位，那個欄位要先出現在 columns 裡。',
    tags: ['Market'],
    request: { body: { content: { 'application/json': { schema: postEtfScreenerBodySchema } } } },
    responses: {
      200: { description: '分頁後的篩選結果。', content: { 'application/json': { schema: etfScreenerResponseSchema } } },
      400: { description: '請求格式錯誤，或 field 不是 GET /etf-screener/filters 列出的欄位。' },
    },
  });
};
