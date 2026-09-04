import { z } from 'zod';
import { registry } from '@/adapters/swagger/registry';

// filterCatalog.ts（1126 行）/columnPresets.ts 是手寫、編譯期已由 TypeScript 完整檢查過的
// 靜態登錄檔字面量，不是「跑在請求/回應邊界、可能帶著未驗證錯誤」的型別——不像其他 domainApi
// 回應型別那樣值得轉成 zod schema 當唯一真理來源。這裡的 schema 純粹是為了 OpenAPI 文件手寫
// 對應形狀，`filterCatalog.ts`/`columnPresets.ts` 本身維持原本的 TypeScript interface 不變。
const filterFieldSchema = z.object({
  key: z.string().meta({ description: '對應該指標 API 回應 JSON 裡的欄位名稱' }),
  name: z.string(),
  period: z.enum(['quarterly', 'quarterlyAnnualized', 'ttm', 'snapshot', 'daily', 'weekly', 'monthly']),
  sort: z.number(),
  description: z.string().optional(),
  source: z.string().optional(),
  unit: z.enum(['percent', 'currency', 'times', 'days', 'ratio', 'score']).optional(),
  aliases: z.array(z.string()).optional(),
});

const filterMetricSchema = z.object({
  key: z.string(),
  name: z.string(),
  path: z.string(),
  modelKey: z.string().optional(),
  description: z.string().optional(),
  source: z.string().optional(),
  unit: z.enum(['percent', 'currency', 'times', 'days', 'ratio', 'score']),
  fields: z.array(filterFieldSchema),
  table: z.string().nullable().meta({ description: '這個顯示分組實際對應 prisma/analysis/schema.prisma 哪張資料表' }),
});

const filterCategorySchema = z.object({
  key: z.string(),
  name: z.string(),
  metrics: z.array(filterMetricSchema),
});

const columnPresetSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  fieldKeys: z.array(z.string()).meta({ description: '格式 "metricKey.fieldKey"' }),
  isDefault: z.boolean().optional(),
});

const filtersResultSchema = z.object({
  categories: z.array(filterCategorySchema),
  columnPresets: z.array(columnPresetSchema),
});

export const registerFiltersOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/filters',
    summary: '列出目前可用來 filter 的分類與欄位，以及產品內建的策展預設 view',
    description:
      '回傳靜態登錄檔（filterCatalog.ts）——依分類（category）分組，分類底下是指標（metric，對應一支 API），' +
      '指標底下是可 filter 的欄位（field，對應該 API 回應 JSON 裡的欄位名稱，單季/年化/TTM 等不同口徑各自獨立一筆）。' +
      '只列已實作的指標，前端可以用這支 API 動態組出 filter UI，不需要把分類/指標清單寫死在前端。' +
      '每個 metric 物件多帶一個 table 欄位——對應 prisma/analysis/schema.prisma 哪張資料表（跟 screener 內部查詢用的是同一份自動解析結果）。' +
      'columnPresets 是產品內建的幾組策展過的欄位組合（例如「存股領息」「價值投資」），給使用者一鍵套用用——' +
      '跟使用者自己客製化要看哪些欄位是不同的兩件事。fieldKeys 格式是 "metricKey.fieldKey"（不能只用裸的 field key——' +
      '部分 field key 同時存在於兩個不同 metric 底下，裸 key 會有歧義）。剛好一組（overview）會有 isDefault: true，' +
      '是使用者選擇之前該顯示的中性初始畫面，不偏向任何一種投資風格。',
    tags: ['System'],
    responses: {
      200: {
        description: '分類 / 指標 / 欄位清單，以及策展預設 view 清單。',
        content: { 'application/json': { schema: filtersResultSchema } },
      },
    },
  });
};
