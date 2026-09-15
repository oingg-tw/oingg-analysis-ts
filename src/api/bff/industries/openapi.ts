import { registry } from '@/adapters/swagger/registry';
import { getIndustryTreeQuerySchema } from './controller';
import { industryTreeNodeResultSchema, industryFlatResultSchema, chainClassificationResultSchema, chainClustersResultSchema, securitiesIndustrySectorsResultSchema } from './types';

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
    path: '/industries/chain-classification',
    summary: '攤平全部公司的供應鏈分類（新版「產業追蹤」頁面用，取代 gov-ts 稅籍分類樹）',
    description:
      '給重建後的「產業追蹤」頁面用——資料源改成 oingg-playwright-py 的供應鏈分類（見 GET /companies/peer-group ' +
      '的說明），跟上面 GET /industries/tree（gov-ts 財政部稅籍五層分類）是完全不同的分類體系，不是取代舊端點，' +
      '是給重建後的新頁面用（舊頁面/舊端點目前仍照常運作）。一次回傳全部約 1984 家上市櫃公司的分類 ' +
      '（含 category 為 null、完全沒出現在供應鏈報告裡的公司，不濾掉）+ 10 組粗分類到細分類的對照表 ' +
      '（groups），前端可以自己組出「粗分類 -> 細分類 -> 公司」的 drill-down 樹狀結構，不用逐一查詢。' +
      'source/updatedAt 兩個欄位語意跟 GET /companies/peer-group 完全一致（見該端點說明），' +
      '這支同樣沒有排程重抓機制，服務啟動後才會反映 playwright-py 那邊的最新變動。沒有查詢參數，純讀記憶體' +
      '快取，成本低，可以每次都打不用自己快取。',
    tags: ['Industries'],
    responses: {
      200: { description: '全部公司的供應鏈分類 + 粗分類對照表。', content: { 'application/json': { schema: chainClassificationResultSchema } } },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/industries/chain-clusters',
    summary: '供應鏈聚落分群 drill-down 樹（「產業追蹤」頁面第二種瀏覽方式，跟 chain-classification 是不同的分群概念）',
    description:
      '給「產業追蹤」頁面用——playwright-py 的供應鏈聚落分群（人工中文標籤，不是 Gemini 生成），跟 ' +
      'GET /industries/chain-classification 的 category/coarseGroup（扁平 2 層業務相似度分組）是完全獨立的另一套 ' +
      '概念：聚落是真正的階層結構（頂層聚落 + 子聚落）。分群方法/數量會隨 playwright-py 調整演算法而變動' +
      '（2026-09-14 當天就從 113 頂層+475 子聚落換成 124 頂層+278 子聚落，新版下每個頂層聚落都有子聚落，但這是' +
      '演算法特性不是保證，某些頂層聚落仍可能沒有子聚落、全部成員都在 directMembers，前端邏輯要能同時處理兩種情況）。' +
      '一次回傳整棵樹（含全部成員），不用逐一查詢。\n\n' +
      '⚠️ **clusterId/subClusterId 不是穩定 id**——playwright-py 重跑供應鏈報告解析重建圖、或調整分群演算法後，' +
      '同一個 id 可能對應到完全不同的一群公司，號碼會整個洗牌（2026-09-14 當天已經發生過一次）。' +
      'playwright-py 重新分群時會主動通知，屆時只需要重啟本服務即可，不需要改程式碼。前端不能把這兩個 id ' +
      '當永久不變的產業分類代碼快取、放進收藏/分享連結，只能當「這次查詢當下的聚落」使用，每次都應該重新呼叫這支端點。\n\n' +
      '成員（members/directMembers）的 code 不是只有台股上市櫃公司——供應鏈圖節點包含國際客戶/供應商（蘋果、' +
      'NVIDIA、ASML 這類），isListed:false 代表這是外部/非上市公司節點（沒有對應的個股詳情頁可以連結），' +
      'name 來自 playwright-py 的公司名稱對照表，不是 twse/tpex company_profile。\n\n' +
      'metaGroup（2026-09-15 新增）：326 個細聚落再收斂成的粗分組（約 17~20 組），跟 ' +
      'GET /industries/chain-classification 的 coarseGroup 是完全不同層級的另一套「粗分組」' +
      '（那個是 33 細分類→10 組，這個是 326 細聚落→約 17~20 組），不要混淆使用。沒有查詢參數，純讀記憶體' +
      '快取，成本低，可以每次都打不用自己快取。',
    tags: ['Industries'],
    responses: {
      200: { description: '全部頂層聚落的完整 drill-down 樹。', content: { 'application/json': { schema: chainClustersResultSchema } } },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/industries/securities-sectors',
    summary: '證交所類股分類清單（投資人習慣的「半導體業」等類股，非財政部稅籍分類）',
    description:
      '資料源是 twse-ts/tpex-ts 的 company_profile.industry 欄位（證交所公告的類股分類，兩碼代碼），' +
      '跟 GET /industries/tree（財政部稅籍五層分類）是完全不同的分類體系，刻意不合併——這支才是「半導體業」' +
      '「電子零組件業」這類投資人熟悉的類股名稱。只有單一層級，扁平回傳全部合法代碼（目前 40 個，排除' +
      '證券商/期貨商/第一上市外國公司身份別/舊產業代碼殘留這幾個非真正產業分類的代碼），companyCount 是' +
      'TWSE+TPEx 兩個市場加總。screener 的 POST /screener、GET /screener/ranking 的 industryCodes 參數' +
      '用的就是這支端點回傳的代碼。',
    tags: ['Industries'],
    responses: {
      200: { description: '全部合法證交所類股代碼清單。', content: { 'application/json': { schema: securitiesIndustrySectorsResultSchema } } },
    },
  });

};
