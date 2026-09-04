import { z } from 'zod';
import { registry } from '@/adapters/swagger/registry';
import { capitalStockHistoryEntrySchema } from '@/shared/sourceData/capitalStock';
import {
  getCompaniesQuerySchema,
  getCompanyProfileQuerySchema,
  getCompanyCapitalStockHistoryQuerySchema,
  getCompanyMetricsQuerySchema,
} from './controller';
import { companyProfileDetailSchema, companyMetricsResultSchema, companiesListResultSchema, companiesCountOnlyResultSchema } from './types';

const capitalStockHistoryResultSchema = z.object({
  symbol: z.string(),
  entries: z.array(capitalStockHistoryEntrySchema),
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
    path: '/companies/metrics',
    summary: '讀取優先的單一公司 consolidated 指標查詢（domainApi 讀取優先）',
    description:
      '取代原本 domainApi/metrics/** 底下 44 支「每支指標各自一個端點、每次都即時現算」的舊端點（已刪除）。' +
      '行為：先讀 analysis 結果表（跟 POST /screener/values 同一套查詢引擎），查得到就直接回傳（source: "cache"）；' +
      '查不到（這張表根本沒有這個 symbol 的任何一列）才委派給 domainBatch 的現算+upsert 邏輯即時補算一次，算完寫回 analysis 表，' +
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
