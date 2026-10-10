import { z } from 'zod';
import { PREFERRED_STOCK_SORTABLE_FIELDS } from '@/application/preferredStock/types';

// 目前只有 28 檔，遠低於這個上限——加分頁是為了跟其他清單型端點（GET /companies）維持
// 一致的介面慣例，也預留之後名單成長的空間，不是現在就有效能疑慮。
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export const getPreferredStocksQuerySchema = z.object({
  symbol: z.string().min(1).optional().meta({ description: '公司代號選填，給了就只回這一檔；不給回全部目前上市中的特別股', example: '1101B' }),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).meta({ description: `這次要拿幾筆，預設 ${DEFAULT_LIMIT}，上限 ${MAX_LIMIT}。` }),
  offset: z.coerce.number().int().min(0).default(0).meta({ description: '跳過前面幾筆，預設 0。' }),
  sortField: z.enum(PREFERRED_STOCK_SORTABLE_FIELDS).optional().meta({ description: '依這個欄位排序，不給就維持 symbol 字母序（isin_securities 原始查詢順序）。' }),
  order: z.enum(['asc', 'desc']).optional().meta({ description: '排序方向，預設 asc；只有給了 sortField 才有作用。' }),
  sortOrder: z.enum(['asc', 'desc']).optional().meta({ description: '已退役，2026-10-24 移除，改用 order', deprecated: true }),
})
  // 2026-10-10 詞彙表（UBIQUITOUS_LANGUAGE.md）：排序方向參數官方名 order；舊名並存到 2026-10-24，兩個都給時以 order 為準。
  .transform(({ order, sortOrder, ...rest }) => ({ ...rest, sortOrder: order ?? sortOrder ?? 'asc' }));
