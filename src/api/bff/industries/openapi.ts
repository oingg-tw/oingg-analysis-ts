import { registry } from '@/adapters/swagger/registry';
import { getIndustryTreeQuerySchema, getValueChainQuerySchema } from './controller';
import { industryTreeNodeResultSchema, industryFlatResultSchema, valueChainNodeResultSchema } from './types';

export const registerIndustriesOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/industries/tree',
    summary: '產業分類階層瀏覽（財政部稅籍五層分類，展開/收合樹狀結構用）',
    description:
      '資料源跟 GET /companies/peer-group 相同（gov-ts 財政部稅籍行業標準分類 section/division/group/class/subclass），' +
      '但這支端點是純瀏覽語意，不做動態層級回退：給一個 code（或不給，代表要樹根/全部 section），回傳它的直屬子節點' +
      '（children）跟精確分類在這個 code 的公司清單（companies）。code 全域唯一，不需要另外傳 level。\n\n' +
      'companyCount 每一層都是「這個節點含所有子孫節點」的公司數加總；companies 則是「精確符合這個 code」' +
      '（不含子孫）——因為 999 家已追蹤公司都分類到 subclass 這個最細層級，companies 在 section/division/' +
      'group/class 層級永遠是空陣列，只有展開到 subclass 才會看到實際公司名單，請改用 companyCount 判斷' +
      '一個分支底下大概有多少公司值不值得展開。\n\n' +
      'found:false 代表帶了 code 但這個代碼在字典裡查無資料（例如打錯字），此時其餘欄位皆為預設空值；' +
      '不帶 code（查樹根）恆為 found:true。範圍限定在 999 家已追蹤公司，不含 KY 股（境外註冊公司結構上沒有台灣稅籍）。',
    tags: ['Industries'],
    request: { query: getIndustryTreeQuerySchema },
    responses: {
      200: { description: '產業節點的直屬子節點與精確分類的公司清單。', content: { 'application/json': { schema: industryTreeNodeResultSchema } } },
      400: { description: 'code 是空字串。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/industries/flat',
    summary: '攤平全部已分類公司的 symbol -> 產業路徑對照表（搜尋/建索引用）',
    description:
      '給「產業追蹤」頁的搜尋功能用（股票代號或分類名稱關鍵字跳到樹狀節點）——一次回傳全部 999 家已分類公司' +
      '的 symbol -> 完整路徑（由 section 到 subclass），不用遞迴打 GET /industries/tree 組全樹索引。' +
      'path 每層都帶 name，可以直接拿來做分類名稱關鍵字搜尋，找到後用 path 最後一個節點的 code 打' +
      'GET /industries/tree?code=xxx 跳轉；用 symbol 找公司則直接查這支端點回應的陣列即可，不用另外開' +
      '/industries/search 端點。範圍限定在 999 家已追蹤公司，不含 KY 股（境外註冊公司結構上沒有台灣稅籍）、' +
      '目前也只有上市（TWSE）公司有產業分類資料（上櫃/興櫃尚未從 gov-ts 補齊）。沒有查詢參數，純讀記憶體' +
      '快取，成本低，可以每次都打不用自己快取。',
    tags: ['Industries'],
    responses: {
      200: { description: '全部已分類公司的 symbol/companyName/path 陣列。', content: { 'application/json': { schema: industryFlatResultSchema } } },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/industries/value-chain',
    summary: '產業價值鏈分類瀏覽（TPEx 產業價值鏈資訊平台，展開/收合樹狀結構用）',
    description:
      '資料源是 tpex-ts 的 export.company_industry_chain，抓自 TPEx「產業價值鏈資訊平台」' +
      '（ic.tpex.org.tw，見回應的 dataSource 欄位），跟 GET /industries/tree 的財政部稅籍分類是' +
      '完全不同的分類體系，不要混用：這裡是 2 層（industry 一級產業 47 個 → subChain 次分類 422 個），' +
      '一家公司可以對應多個 subChain（例如同時做 IC 設計又做封測），不是唯一分類；但涵蓋範圍是三個' +
      '市場層級都有（上市/上櫃/興櫃，實測 1031+889+351=2271 家公司、6481 筆對應關係），' +
      '不像 /industries/tree 只有 999 家 TWSE 上市公司。\n\n' +
      '給一個 code（industry_code 或 sub_chain_code 皆可，sub_chain_code 全域唯一不會跨 industry ' +
      '重複，不需要另外傳 level）或不給（回傳樹根/全部一級產業）。children 只在樹根/industry 層級' +
      '有值（分別是一級產業清單/次分類清單），companies 只在 subChain 層級有值（因為一家公司可能同' +
      '時屬於多個 subChain，不做「含子孫」的公司數加總，companyCount 只代表直屬這個節點的公司數）。\n\n' +
      'found:false 代表帶了 code 但這個代碼查無資料；不帶 code（查樹根）恆為 found:true。' +
      '資料是對 ic.tpex.org.tw 做 HTML scraping 取得，不是 TPEx 官方 API，快照表沒有更新時間概念。',
    tags: ['Industries'],
    request: { query: getValueChainQuerySchema },
    responses: {
      200: { description: '產業價值鏈節點的直屬子節點與精確對應的公司清單。', content: { 'application/json': { schema: valueChainNodeResultSchema } } },
      400: { description: 'code 是空字串。' },
    },
  });
};
