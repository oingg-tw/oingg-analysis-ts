import { z } from 'zod';
import { registry } from '@/adapters/swagger/registry';
import { capitalStockHistoryEntrySchema } from '@/shared/sourceData/capitalStock';
import { roeHistoryEntrySchema } from '@/domainPitMetrics/profitability/roe/queryRoeHistory';
import { roaHistoryEntrySchema } from '@/domainPitMetrics/profitability/roa/queryRoaHistory';
import { dupontHistoryEntrySchema } from '@/domainPitMetrics/shared/dupont/queryDupontHistory';
import { metricHistoryEntrySchema } from '@/domainPitMetrics/queryMetricHistory';
import { multiMetricHistoryEntrySchema } from '@/domainPitMetrics/queryMultiMetricHistory';
import { monthlyRevenueEntrySchema } from '@/shared/sourceData/monthlyRevenue';
import { metricDefinitionRegistry } from '@/domainPitMetrics/metricDefinitionRegistry';
import {
  getCompaniesQuerySchema,
  getCompanyProfileQuerySchema,
  getCompanyCapitalStockHistoryQuerySchema,
  getCompanyRoeHistoryQuerySchema,
  getCompanyRoaHistoryQuerySchema,
  getCompanyDupontHistoryQuerySchema,
  getCompanyMetricHistoryQuerySchema,
  getCompanyMetricsHistoryQuerySchema,
  getCompanyMonthlyRevenueHistoryQuerySchema,
  getCompanyFinancialStatementQuerySchema,
  getCompanyPeerGroupQuerySchema,
  getCompanyPiotroskiBreakdownQuerySchema,
  getCompanyMetricProvenanceQuerySchema,
} from './controller';
import {
  companyProfileDetailSchema,
  companiesListResultSchema,
  companiesCountOnlyResultSchema,
  companyPeerGroupResultSchema,
  financialStatementResultSchema,
  piotroskiFScoreBreakdownResultSchema,
  metricProvenanceResultSchema,
} from './types';

const capitalStockHistoryResultSchema = z.object({
  symbol: z.string(),
  entries: z.array(capitalStockHistoryEntrySchema),
});

// total/hasMore：2026-09-07 使用者要求——total 是這個 symbol/metricCode/periodType(或 token) 去重後
// 總共有幾期（不受 limit 影響），hasMore = total > entries.length。前端可以用這兩個
// 欄位決定要不要提供「看更長區間」的選項，例如完整歷史只有 6 年就不該讓使用者點「近 10
// 年」（點了也只會拿到一樣的 6 年資料）。四支歷史端點都是同樣的語意，用同一段說明。
const totalHasMoreFields = {
  total: z.number().meta({ description: '這個查詢條件去重後總共有幾期資料，不受 limit 影響——前端可以用這個數字判斷要不要提供更長區間的選項' }),
  hasMore: z.boolean().meta({ description: '= total > entries 的實際筆數，代表是否還有更早的資料沒有回傳（目前沒有 offset，無法翻頁取得）' }),
};

const roeHistoryResultSchema = z.object({
  symbol: z.string(),
  metricCode: z.literal('roe'),
  periodType: z.enum(['Q', 'Q_ANN', 'TTM']),
  ...totalHasMoreFields,
  entries: z.array(roeHistoryEntrySchema),
});

const roaHistoryResultSchema = z.object({
  symbol: z.string(),
  metricCode: z.literal('roa'),
  periodType: z.enum(['Q', 'Q_ANN', 'TTM']),
  ...totalHasMoreFields,
  entries: z.array(roaHistoryEntrySchema),
});

const dupontHistoryResultSchema = z.object({
  symbol: z.string(),
  periodType: z.enum(['Q', 'TTM']),
  ...totalHasMoreFields,
  entries: z.array(dupontHistoryEntrySchema),
});

const metricHistoryResultSchema = z.object({
  symbol: z.string(),
  metricCode: z.string(),
  token: z.string(),
  ...totalHasMoreFields,
  entries: z.array(metricHistoryEntrySchema),
});

const metricsHistoryResultSchema = z.object({
  symbol: z.string(),
  metricCodes: z.array(z.string()),
  token: z.string(),
  ...totalHasMoreFields,
  entries: z.array(multiMetricHistoryEntrySchema),
});

const monthlyRevenueHistoryResultSchema = z.object({
  symbol: z.string(),
  ...totalHasMoreFields,
  entries: z.array(monthlyRevenueEntrySchema),
});

export const registerCompaniesOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/companies',
    summary: '列出公司代號/名稱對照表（分頁）',
    description:
      '給 bff-ts 自己快取用——多公司陣列結果（screener、valuation/ranking、market/*-ranking 這類）已經直接在回應裡帶 companyName/name，' +
      '單一公司的一般指標 API 也會明確補上 companyName（見 registerCompanyRoute.ts）。這支端點還留著，是給還沒被涵蓋到的情境、' +
      '或 bff-ts 想自己維護本地快取時用，不是唯一的補名稱管道。涵蓋上市（TWSE）+ 上櫃（TPEx），查不到簡稱的公司 companyName 會是 null。' +
      '這是低頻異動的參考資料，建議 bff-ts 自己快取、不用每次都打。' +
      'limit 這次要拿幾筆由呼叫端自己依業務邏輯決定，本服務只負責上限（1000，避免一次回應過大）；' +
      '也提供 countOnly=true 只回總筆數，不用先拉一批資料才知道總共幾筆。',
    tags: ['System'],
    request: { query: getCompaniesQuerySchema },
    responses: {
      200: {
        description: 'countOnly=true 時是 { count }；否則是 { count, limit, offset, entries }，count 一律是全部符合條件的總筆數（不是這次回傳的筆數）。',
        content: {
          'application/json': { schema: z.union([companiesListResultSchema, companiesCountOnlyResultSchema]) },
        },
      },
      400: { description: '請求的參數格式錯誤，或 limit 超過上限。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/profile',
    summary: '單一公司基本資料（董事長/總經理/發言人/設立上市日期/資本額等）',
    description:
      '給個股詳情頁的公司基本資料卡片用。上市（TWSE）查無資料再查上櫃（TPEx），兩邊都查無資料回傳 404。' +
      'TWSE/TPEx 兩邊欄位範圍不完全一樣（TPEx 沒有 englishAddress/industryName），沒有的欄位回傳 null。' +
      'paidInCapital/issuedShares/privatePlacementShares/preferredStockShares 是資料庫的 bigint，序列化成字串，避免 JS 數字精度問題。' +
      'financialReportTypeName 是 financialReportType 裸代碼（"1"/"2"）解出來的可讀名稱（個別財報／合併財報），未知代碼回 null。' +
      'website 已正規化成乾淨的裸網域（去 scheme/尾斜線/www. 前綴），呼叫端不用自己再清洗一次。',
    tags: ['System'],
    request: { query: getCompanyProfileQuerySchema },
    responses: {
      200: { description: '公司基本資料。', content: { 'application/json': { schema: companyProfileDetailSchema } } },
      400: { description: '缺少 symbol。' },
      404: { description: '查無此公司代號（上市、上櫃都查不到）。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/capital-stock-history',
    summary: '單一公司股本異動歷史（現金增資/盈餘轉增資/合併增資/減資等）',
    description:
      '給個股頁面「股本變化」卡片用——讓使用者對照流通股數變化跟 EPS 成長，判斷是真成長還是股本膨脹稀釋出來的假象。' +
      '資料來源是 mops-ts 的 export.capital_stock_history，是「異動事件序列」不是固定季度/年度快照，entries 依 effectiveDate 由新到舊排序。' +
      'changeSource 是結構化的變動原因細分，other 是不屬於這五種時的自由格式文字。' +
      'sharesChangePercent 是跟時間序列上更早的前一筆相比的變動百分比（四捨五入到小數 2 位），最早一筆是 null。' +
      '查無資料回傳 entries: []，是 200 不是 404——404 只代表「這家公司在 company_profile 查不到」，跟「查不到股本異動歷史」是兩件事。',
    tags: ['System'],
    request: { query: getCompanyCapitalStockHistoryQuerySchema },
    responses: {
      200: { description: '股本異動歷史（由新到舊排序），查無資料時 entries 是空陣列。', content: { 'application/json': { schema: capitalStockHistoryResultSchema } } },
      400: { description: '缺少 symbol。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/roe-history',
    summary: '單一公司 ROE 歷史時序（畫圖用）',
    description:
      '第一支直接讀 metric_values（point-in-time 事實層，見 docs/analysis-ts-spec-v0.2.md）而不是傳統結果表' +
      '（profitability_roe）的端點——每一筆帶 knowledgeDate（該值最早可被市場知道的日期）跟 knowledgeDateIsFallback' +
      '（true 代表查無真實財報公告日、用財報期末日頂替，有 look-ahead bias 風險，前端可考慮標示）。' +
      'periodType 預設 TTM（近四季滾動）；同一個 (fiscalYear, fiscalQuarter) 如果有多筆（未來的重編疊加情境），' +
      '只回傳 knowledge_date 最新的那一筆。entries 依期別由舊到新排序，方便直接畫時序圖。' +
      '**目前資料覆蓋率極低**：只有少數公司/季度有資料（全市場 backfill 尚未進行），查無資料回傳 entries: []，' +
      '不是 404 或錯誤，是正常情境。（2026-09-08：這個 query 參數原本叫 basis，改名 periodType——' +
      '「basis」違反 ubiquitous language，是會計保留用語，不是這裡要表達的「季報聚合方式」。）',
    tags: ['System'],
    request: { query: getCompanyRoeHistoryQuerySchema },
    responses: {
      200: { description: 'ROE 歷史時序（由舊到新排序），查無資料時 entries 是空陣列。', content: { 'application/json': { schema: roeHistoryResultSchema } } },
      400: { description: '缺少 symbol，或 periodType/limit 格式錯誤。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/roa-history',
    summary: '單一公司 ROA 歷史時序（畫圖用）',
    description:
      '第二支直接讀 metric_values（point-in-time 事實層）而不是傳統結果表（profitability_roa）的端點，' +
      '完全比照 GET /companies/roe-history 的模式（periodType 語意、knowledgeDate/knowledgeDateIsFallback、' +
      '排序、資料覆蓋率現況說明皆相同，這裡不重複列一次）。',
    tags: ['System'],
    request: { query: getCompanyRoaHistoryQuerySchema },
    responses: {
      200: { description: 'ROA 歷史時序（由舊到新排序），查無資料時 entries 是空陣列。', content: { 'application/json': { schema: roaHistoryResultSchema } } },
      400: { description: '缺少 symbol，或 periodType/limit 格式錯誤。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/dupont-history',
    summary: '單一公司杜邦分析拆解歷史時序（畫圖用）',
    description:
      '直接讀 metric_values 的 netProfitMargin/assetTurnover/equityMultiplier/dupontDecomposedRoe' +
      '四個 metric_code 組合而成——**這批遷移刻意只做 Dupont 拆解嚴格需要的最小集合**：只有淨利率、' +
      '總資產週轉率兩個因子，不是完整的毛利率（含毛利率/營業利益率）或週轉率（含存貨/應收帳款/' +
      '固定資產/應付帳款周轉率跟 DIO/DSO/DPO/CCC）家族，這兩個因子也因此不單獨開歷史查詢端點，' +
      '只在這支組合端點裡曝露。decomposedRoePct = netProfitMarginPct x assetTurnover x equityMultiplier，' +
      '理論上應該接近（但不必完全等於）GET /companies/roe-history 的實際 ROE，差異來自中間值四捨五入' +
      '造成的正常誤差。periodType=TTM 時 equityMultiplier 恆為 null（權益乘數是資產負債表時點快照，沒有 TTM' +
      '變體，Q/TTM 拆解共用同一個 Q 快照值）。knowledgeDate/knowledgeDateIsFallback 取這四個 metric_code' +
      '裡 netProfitMargin 那組的值當代表（同一次計算共用同一組 knowledge_date，正常情況下一致）。' +
      '**目前資料覆蓋率極低**：只有少數公司/季度有資料，查無資料回傳 entries: []，是正常情境。',
    tags: ['System'],
    request: { query: getCompanyDupontHistoryQuerySchema },
    responses: {
      200: { description: '杜邦拆解歷史時序（由舊到新排序），查無資料時 entries 是空陣列。', content: { 'application/json': { schema: dupontHistoryResultSchema } } },
      400: { description: '缺少 symbol，或 periodType/limit 格式錯誤。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/metric-history',
    summary: '單一公司任意 point-in-time 指標歷史時序（泛化版，畫圖用）',
    description:
      '直接讀 metric_values（point-in-time 事實層）的泛化版查詢端點——2026-09-06 第三批遷移' +
      '（10 個新 metric_code）動工前新增，取代每遷一支指標就各自複製貼上一段端點樣板碼的模式。' +
      'metricCode 決定要查哪支指標，完整清單見程式碼裡的 metricDefinitionRegistry（目前已知：' +
      `${Object.keys(metricDefinitionRegistry).join('、')}），之後新增指標會持續增加，這裡不逐一列出维護。` +
      'token 允許的值由 metricCode 決定（例如 bvps 只允許 periodType "Q"，beta 只允許' +
      '"<lookbackRange>_<samplingInterval>" 例如 "2Y_1W"，exchangePeRatio 只允許 "EOD"），' +
      '傳不允許的值會回 400 並附上這個 metricCode 實際允許的清單，完整組合見 GET /metrics。' +
      'knowledgeDate/knowledgeDateIsFallback 語意跟 roe-history 一致。' +
      '**roe-history/roa-history/dupont-history 三支既有端點不受影響，繼續保留**——這支只是' +
      '之後新增指標的曝露管道，不是要取代它們。（2026-09-08：這個 query 參數原本叫 basis，' +
      '改名 token 並改成同時涵蓋四組概念（periodType/lookbackRange+samplingInterval/' +
      'snapshotCadence，見 metric_values.basis 拆分重構）——「basis」違反 ubiquitous language。）',
    tags: ['System'],
    request: { query: getCompanyMetricHistoryQuerySchema },
    responses: {
      200: { description: '歷史時序（由舊到新排序），查無資料時 entries 是空陣列。', content: { 'application/json': { schema: metricHistoryResultSchema } } },
      400: { description: '缺少 symbol/metricCode/token，或 metricCode 未知，或 token 不在該 metricCode 允許的清單內。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/metrics-history',
    summary: '單一公司一次抓多個 point-in-time 指標歷史時序（畫圖/卡片用）',
    description:
      '泛化版「一次抓多個指標」端點——跟 metric-history 一次只能查一個 metricCode 不同，' +
      '這支用逗號分隔的 metricCodes 一次查多個（例如三率一次拿：' +
      '"grossMargin,operatingMargin,netProfitMargin"，最多 10 個），依 (fiscalYear,fiscalQuarter)' +
      '合併成一列，entries[].values 是以 metricCode 為 key 的物件，對應請求時給的清單。' +
      'token 套用到清單裡的每個 metricCode，任一個不允許該 token 就整體回 400（附上是哪個' +
      'metricCode 不允許），不會部分成功。**這支跟 dupont-history 是不同定位**：dupont-history' +
      '是杜邦拆解這種真正有語意組裝關係（三/五因子相乘）的家族專用組合端點，寫死具名欄位；這支' +
      '是任意 metricCode 的通用合併，沒有假設彼此有數學關係，純粹省去前端自己併多次呼叫結果的' +
      '麻煩。某個 metricCode 在某一期完全沒有列時（例如不同指標 backfill 範圍不同步），對應' +
      'values[metricCode] 為 null。total 取清單裡所有 metricCode 中最完整（total 最大）的那個。' +
      '（2026-09-08：query 參數原本叫 basis，改名 token，理由同 GET /companies/metric-history。）',
    tags: ['System'],
    request: { query: getCompanyMetricsHistoryQuerySchema },
    responses: {
      200: { description: '多指標歷史時序（由舊到新排序），查無資料時 entries 是空陣列。', content: { 'application/json': { schema: metricsHistoryResultSchema } } },
      400: { description: '缺少 symbol/metricCodes/token，或某個 metricCode 未知，或 token 不在某個 metricCode 允許的清單內，或 metricCodes 超過上限。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/monthly-revenue-history',
    summary: '單一公司月營收歷史（畫圖用，目前僅 2330 有資料）',
    description:
      '**目前只有 2330 有資料**（twse-ts 2026-09-07 一次性手動回填，2021-08~2026-07 共 60 個月，' +
      '從 MOPS 舊制個股查詢頁逐月抓的，不是常態每日更新的管道，之後也不會自動長出新月份或新公司）。' +
      '查其他公司代號會正確回 entries: []（不是 404 或錯誤），跟 capital-stock-history 同一種' +
      '「查無歷史資料是正常情境」的慣例——**不要誤以為這是全市場即時月營收功能**。' +
      'momChangePercent（月增率）是本服務自己用相鄰兩個月的 currentMonthRevenue 反推算出來的' +
      '（來源這批一次性回填的資料沒有這個欄位）；yoyChangePercent（年增率）、cumulativeChangePercent' +
      '（累計營收年增率）是來源直接算好的欄位，原樣透傳。金額欄位（currentMonthRevenue 等）都是' +
      'bigint 序列化成字串，單位新台幣千元。',
    tags: ['System'],
    request: { query: getCompanyMonthlyRevenueHistoryQuerySchema },
    responses: {
      200: { description: '月營收歷史（由舊到新排序），查無資料時 entries 是空陣列。', content: { 'application/json': { schema: monthlyRevenueHistoryResultSchema } } },
      400: { description: '缺少 symbol，或 limit 格式錯誤。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/financial-statement',
    summary: '單一公司單張財報表原始科目（會計模式，資產負債表/損益表/現金流量表整列透傳，供稽核用）',
    description:
      '給前端「會計模式」用——選定 statementType（資產負債表/損益表/現金流量表其中一張），一次拿到' +
      '該季申報方原始揭露的**全部**科目欄位金額，不是算好的單一比率、也不是服務內部計算需要的精簡' +
      '欄位子集，是給會計用戶稽核數字用的完整版本，符合傳統看報表的習慣，跟 point-in-time 那套算好的' +
      '指標歷史（GET /companies/roe-history 那些）刻意分開。' +
      '2026-09-07 起資產負債表/損益表改接 XBRL 寬表（export.quarterly_balance_sheet_xbrl/' +
      'quarterly_income_statement_xbrl，動態回傳扣掉 identity/metadata 欄位後的全部科目，資產負債表' +
      '約 90 個、損益表約 48 個，不手動列舉欄位名稱，mops-ts 那邊寬表新增欄位會自動出現），現金流量表' +
      '接 XBRL 長表（export.xbrl_three_statements_long，account_code 數量依該公司該季實際揭露而定，' +
      '沒有固定欄位數）——**這批 XBRL 情境下 statement 物件的 key 是資料庫原始 snake_case account_code' +
      '（例如 current_fin_assets_fvtpl），不轉 camelCase**，方便使用者直接拿科目代碼去對照 XBRL 官方' +
      '分類或其他工具核對，這是刻意的設計。查無 XBRL 資料時會 fallback 到舊三大表（mops-ts 較早期的' +
      '季報表 export view，欄位數量少很多，資產負債表約 26 個），**這個情境下 key 會是 camelCase**——' +
      '同一支端點依資料源不同回傳不同 key 風格，是刻意的不一致，前端不應該假設 key 一定是某一種風格，' +
      '應該把 statement 當成不透明的 key-value 集合整包呈現。year/season 選填但要成對，不給就自動抓' +
      '該張表（只看這一張，不是三張表的交集）最新一季——這個「最新一季」的判斷仍然只看舊三大表（跟' +
      '哪一季有資料無關的 XBRL 覆蓋率不影響這個判斷）。dataType 固定用合併報表、subsidiaryCompanyId' +
      '固定空字串，不對外曝露這兩個內部參數，跟 metric-history 同一個慣例。金額欄位序列化成字串避免' +
      'JS 數字精度問題；查無資料（這家公司這張表完全沒有資料，新舊都沒有，或指定的 year/season 那一季' +
      '沒有資料）回傳 200 + found:false + statement:null，不是 404，跟 roe-history/' +
      'capital-stock-history 同一種「查無歷史資料是正常情境」的慣例。',
    tags: ['System'],
    request: { query: getCompanyFinancialStatementQuerySchema },
    responses: {
      200: { description: '該季該表全部科目欄位；查無資料時 found 為 false、statement 為 null。', content: { 'application/json': { schema: financialStatementResultSchema } } },
      400: { description: '缺少 symbol/statementType，statementType 不是合法值，或 year/season 只給了其中一個。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/peer-group',
    summary: '單一公司產業同業清單（產業同業比較功能第一步）',
    description:
      '用財政部稅籍行業標準分類（來源：gov-ts）找出同業公司清單，只回傳同業名單，**不含財務指標數值**——' +
      '拿到 peers 之後請自行呼叫 POST /screener/values（symbols + columns，field 格式 "metricCode.token"）查實際指標數值，' +
      '這支端點刻意不重複做數值查詢那一層。' +
      '同業分組用動態層級回退：子類→細類→小類→中類，依序嘗試，同業數（含目標公司自己）達到 minPeers 就停在該層；' +
      '連中類都不足門檻也會停在中類（不繼續往更粗的層級爬），此時 warnings 會提示「已回退到最粗層級，同業可能包含商業模式不同的公司」。' +
      'industryLevel 明確標示這次比較實際用的是哪一層，避免誤把寬鬆比較當成精確比較。' +
      'found:false 代表查無分類資料，分兩種情況：這家公司資料暫時沒被 gov-ts 涵蓋到，或是境外註冊（KY）公司——' +
      'KY 股結構上沒有台灣稅籍、永遠不會有分類資料，這種情況 warnings 會明確提示「請在呼叫前先篩掉 KY 股」，' +
      '不是暫時性的資料缺漏。這支端點不驗證 symbol 是否為真實存在的公司（那是 GET /companies/profile 的職責），查無資料一律回 200。',
    tags: ['System'],
    request: { query: getCompanyPeerGroupQuerySchema },
    responses: {
      200: { description: '同業清單（含目標公司自己），查無分類資料時 found 為 false、peers 為空陣列。', content: { 'application/json': { schema: companyPeerGroupResultSchema } } },
      400: { description: '缺少 symbol，或 minPeers 格式錯誤。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/piotroski-breakdown',
    summary: 'Piotroski F-Score 9 個子訊號分組明細',
    description:
      'piotroskiFScore.Q 只寫入最終 0-9 分（見 GET /metrics），9 個二元子訊號本身不是獨立可篩選的' +
      'metric_code，這支端點現查現算，依 Piotroski (2000) 原始論文的分組回傳：獲利能力（4 訊號：' +
      'positiveRoa/positiveCfo/roaImproved/accrualQuality）、財務槓桿與流動性（3 訊號：' +
      'leverageDecreased/liquidityImproved/noDilution）、營運效率（2 訊號：' +
      'grossMarginImproved/assetTurnoverImproved）。組內子分數（denominator 4/3/2）不在這裡計算，' +
      '呼叫端自行依 boolean 值加總即可。totalScore 跟 piotroskiFScore.Q 同一套全有全無邏輯——9 個' +
      '子訊號只要有一個評估不出來（例如缺去年同季資料），totalScore 跟該子訊號都是 null，不會拿其他' +
      '8 個湊分數。year/season 選填但要成對，不給就自動抓最新一季。查無資料（found:false）是正常情境，' +
      '回 200 不是 404，跟 financial-statement/roe-history 同一種慣例。groupMetadata（3 個子分組各自的' +
      'name/nameEn/summary/detail/denominator）跟 signalLabels（9 個訊號 key 各自的中文顯示標籤）是' +
      '2026-09-11 新增的純靜態文字，不隨 symbol/期別變化、found=false 時也會回傳——給前端 i18n 用，' +
      '取代原本寫死在前端的文字，刻意不放進 GET /metrics 的 badge 欄位（那是 12 支 badge 共用的型別，' +
      '只有 Piotroski 有「拆組」這個概念，不適合污染共用形狀）。',
    tags: ['System'],
    request: { query: getCompanyPiotroskiBreakdownQuerySchema },
    responses: {
      200: {
        description: '9 個子訊號依 3 組回傳，附帶 groupMetadata/signalLabels 靜態文字；查無資料時 found 為 false、totalScore/groups 為 null（groupMetadata/signalLabels 仍會回傳）。',
        content: { 'application/json': { schema: piotroskiFScoreBreakdownResultSchema } },
      },
      400: { description: '缺少 symbol，或 year/season 只給了其中一個。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/{symbol}/metric-provenance',
    summary: '單一指標的原始計算來源明細（會計模式「點數字看來源」用，目前限 sue/chowderNumber/roe 三支試點）',
    description:
      '讓使用者點擊徽章上的數字時，能看到這個數字實際用了哪些原始財報欄位、各自的值，用來跳轉到' +
      'GET /companies/financial-statement 對應的那一列——現查現算，不持久化，跟 GET ' +
      '/companies/piotroski-breakdown 同一個模式。entries 是依公式使用順序排列的扁平清單，不是' +
      '巢狀的推導樹；每一筆帶自己的 fiscalYear/fiscalQuarter，已經足夠表達「用了哪幾季」。type=' +
      '"statementField" 的 fieldKey 是 snake_case，跟 GET /companies/financial-statement 回傳的' +
      'XBRL key 完全一致，可直接連結；該筆命中舊表 fallback 時會降級成 type="other"、' +
      'sourceDescription="舊表資料，非 XBRL"（因為舊表 fallback 情境下 financial-statement 回的是' +
      'camelCase key，跟這裡的 snake_case fieldKey 對不上）。type="other" 是非財報欄位的來源（市場' +
      '快照、股本變動申報等），只給 sourceDescription 文字說明，沒有可連結的 fieldKey。methodologyNote' +
      '是部分指標的完整計算方法無法用單純欄位清單呈現時的補充說明——例如 sue 的標準差取自最近 20 期' +
      '未預期盈餘樣本，entries 只列出構成本季 UE 的 2 期（本季/去年同季）原始欄位，20 期樣本本身不' +
      '逐筆列出，methodologyNote 會講清楚這個取捨；其餘指標為 null。試點範圍刻意只有 sue/' +
      'chowderNumber/roe 三支（metricCode 用 zod enum 驗證，其餘一律 400，不是隱性涵蓋所有指標）。' +
      'roe 目前固定回傳 TTM basis 的溯源。year/season 選填但要成對，不給就自動抓最新一季。查無資料' +
      '（found:false）是正常情境，回 200 不是 404，跟 financial-statement/piotroski-breakdown 同一' +
      '種慣例。symbol 是路徑參數，跟其餘 /companies/* 端點的 query 參數用法不同，這是刻意的設計。',
    tags: ['System'],
    request: { params: z.object({ symbol: z.string().meta({ description: '公司代號', example: '2330' }) }), query: getCompanyMetricProvenanceQuerySchema },
    responses: {
      200: { description: '該指標計算所用的原始欄位明細；查無資料時 found 為 false、entries 為空陣列。', content: { 'application/json': { schema: metricProvenanceResultSchema } } },
      400: { description: '缺少 symbol，metricCode 不是 sue/chowderNumber/roe 之一，或 year/season 只給了其中一個。' },
    },
  });
};
