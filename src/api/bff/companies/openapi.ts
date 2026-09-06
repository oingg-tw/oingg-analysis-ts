import { z } from 'zod';
import { registry } from '@/adapters/swagger/registry';
import { capitalStockHistoryEntrySchema } from '@/shared/sourceData/capitalStock';
import { roeHistoryEntrySchema } from '@/pitMetrics/roe/queryRoeHistory';
import { roaHistoryEntrySchema } from '@/pitMetrics/roa/queryRoaHistory';
import { dupontHistoryEntrySchema } from '@/pitMetrics/dupont/queryDupontHistory';
import {
  getCompaniesQuerySchema,
  getCompanyProfileQuerySchema,
  getCompanyCapitalStockHistoryQuerySchema,
  getCompanyRoeHistoryQuerySchema,
  getCompanyRoaHistoryQuerySchema,
  getCompanyDupontHistoryQuerySchema,
  getCompanyPeerGroupQuerySchema,
  getCompanyMetricsQuerySchema,
} from './controller';
import {
  companyProfileDetailSchema,
  companyMetricsResultSchema,
  companiesListResultSchema,
  companiesCountOnlyResultSchema,
  companyPeerGroupResultSchema,
} from './types';

const capitalStockHistoryResultSchema = z.object({
  symbol: z.string(),
  entries: z.array(capitalStockHistoryEntrySchema),
});

const roeHistoryResultSchema = z.object({
  symbol: z.string(),
  metricCode: z.literal('roe'),
  basis: z.enum(['Q', 'Q_ANN', 'TTM']),
  entries: z.array(roeHistoryEntrySchema),
});

const roaHistoryResultSchema = z.object({
  symbol: z.string(),
  metricCode: z.literal('roa'),
  basis: z.enum(['Q', 'Q_ANN', 'TTM']),
  entries: z.array(roaHistoryEntrySchema),
});

const dupontHistoryResultSchema = z.object({
  symbol: z.string(),
  basis: z.enum(['Q', 'TTM']),
  entries: z.array(dupontHistoryEntrySchema),
});

// registerCompanyRoute 會在 handler 回傳的物件上補一個 companyName 欄位再送出（見
// src/shared/registerCompanyRoute.ts），這裡是那個補完之後、實際送到 client 的完整形狀。
const companyMetricsHttpResponseSchema = companyMetricsResultSchema.extend({
  companyName: z.string().nullable(),
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
      'basis 預設 TTM（近四季滾動）；同一個 (fiscalYear, fiscalQuarter) 如果有多筆（未來的重編疊加情境），' +
      '只回傳 knowledge_date 最新的那一筆。entries 依期別由舊到新排序，方便直接畫時序圖。' +
      '**目前資料覆蓋率極低**：只有少數公司/季度有資料（全市場 backfill 尚未進行），查無資料回傳 entries: []，' +
      '不是 404 或錯誤，是正常情境。',
    tags: ['System'],
    request: { query: getCompanyRoeHistoryQuerySchema },
    responses: {
      200: { description: 'ROE 歷史時序（由舊到新排序），查無資料時 entries 是空陣列。', content: { 'application/json': { schema: roeHistoryResultSchema } } },
      400: { description: '缺少 symbol，或 basis/limit 格式錯誤。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/roa-history',
    summary: '單一公司 ROA 歷史時序（畫圖用）',
    description:
      '第二支直接讀 metric_values（point-in-time 事實層）而不是傳統結果表（profitability_roa）的端點，' +
      '完全比照 GET /companies/roe-history 的模式（basis 語意、knowledgeDate/knowledgeDateIsFallback、' +
      '排序、資料覆蓋率現況說明皆相同，這裡不重複列一次）。',
    tags: ['System'],
    request: { query: getCompanyRoaHistoryQuerySchema },
    responses: {
      200: { description: 'ROA 歷史時序（由舊到新排序），查無資料時 entries 是空陣列。', content: { 'application/json': { schema: roaHistoryResultSchema } } },
      400: { description: '缺少 symbol，或 basis/limit 格式錯誤。' },
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
      '造成的正常誤差。basis=TTM 時 equityMultiplier 恆為 null（權益乘數是資產負債表時點快照，沒有 TTM' +
      '變體，Q/TTM 拆解共用同一個 Q 快照值）。knowledgeDate/knowledgeDateIsFallback 取這四個 metric_code' +
      '裡 netProfitMargin 那組的值當代表（同一次計算共用同一組 knowledge_date，正常情況下一致）。' +
      '**目前資料覆蓋率極低**：只有少數公司/季度有資料，查無資料回傳 entries: []，是正常情境。',
    tags: ['System'],
    request: { query: getCompanyDupontHistoryQuerySchema },
    responses: {
      200: { description: '杜邦拆解歷史時序（由舊到新排序），查無資料時 entries 是空陣列。', content: { 'application/json': { schema: dupontHistoryResultSchema } } },
      400: { description: '缺少 symbol，或 basis/limit 格式錯誤。' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/companies/peer-group',
    summary: '單一公司產業同業清單（產業同業比較功能第一步）',
    description:
      '用財政部稅籍行業標準分類（來源：gov-ts）找出同業公司清單，只回傳同業名單，**不含財務指標數值**——' +
      '拿到 peers 之後請自行呼叫 POST /screener/values（symbols + columns）查實際指標數值（獲利能力/估值倍數/財務體質等），' +
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
    path: '/companies/metrics',
    summary: '讀取優先的單一公司 consolidated 指標查詢（api/bff 讀取優先）',
    description:
      '取代原本 api/bff/metrics/** 底下 44 支「每支指標各自一個端點、每次都即時現算」的舊端點（已刪除）。' +
      '行為：先讀 analysis 結果表（跟 POST /screener/values 同一套查詢引擎），查得到就直接回傳（source: "cache"）；' +
      '查不到（這張表根本沒有這個 symbol 的任何一列）才委派給 api/batch 的現算+upsert 邏輯即時補算一次，算完寫回 analysis 表，' +
      '下次查詢就會是 cache hit（source: "computed"）。真的沒有資料可算則是 source: "unavailable"。' +
      'fields 逗號分隔，每個是 "metricKey.fieldKey" 格式（跟 GET /filters 的 catalog、POST /screener/values 同一套定址方式，' +
      '可以先打 GET /filters 知道有哪些 metricKey/fieldKey 可用）。不支援 equityRiskPremium/govBondYield10y（全市場單一值，不分公司，' +
      '請改打 GET /macro/equity-risk-premium / GET /macro/gov-bond-yield-10y）跟 obv（BigInt 型別，這次不處理），帶這些 key 會回 400。',
    tags: ['System'],
    request: { query: getCompanyMetricsQuerySchema },
    responses: {
      200: {
        description: '每個要求的 field 都保證出現在 values 裡。',
        content: { 'application/json': { schema: companyMetricsHttpResponseSchema } },
      },
      400: { description: '缺少 symbol/fields、fields 格式錯誤、或帶了不支援單一公司查詢的 field。' },
    },
  });
};
