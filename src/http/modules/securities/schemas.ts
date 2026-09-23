import { z } from 'zod';
import { booleanQueryParam } from '@/http/schemas/queryParams';

// 上限/預設值跟 GET /companies 一致。
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;

// countOnly 的 transform 直接放在匯出的 schema 上：zod-to-openapi 文件化的是 transform 前的輸入 schema
// （optional string，跟以前分成兩份 schema 時一模一樣），執行期驗證拿到的是 boolean——不再需要私有的
// parsed 變體。z.coerce.boolean() 是陷阱（非空字串一律 true，含字面上的 "false"），用字串本身判斷才對。
export const getSecuritiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).meta({ description: `這次要拿幾筆，預設 ${DEFAULT_LIMIT}，上限 ${MAX_LIMIT}。` }),
  offset: z.coerce.number().int().min(0).default(0).meta({ description: '跳過前面幾筆，預設 0。' }),
  countOnly: booleanQueryParam('true 時只回總筆數（`{ count }`），不拉實際資料。'),
});
