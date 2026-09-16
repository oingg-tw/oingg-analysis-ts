import { z } from 'zod';
import { registry } from '@/infrastructure/swagger/registry';
import { getSecuritiesQuerySchema } from './controller';
import { securitiesListResultSchema, securitiesCountOnlyResultSchema } from './types';

export const registerSecuritiesOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/securities',
    summary: '列出證券代號/名稱對照表（分頁，含特別股）',
    description:
      '跟 GET /companies 是刻意分開的兩個概念：「公司」是 company_profile 的完整登記範疇（不含特別股/ETF），' +
      '「證券」是真正能交易的標的（一般股票＋特別股＋ETF），searchbar 這類需要涵蓋特別股（例如 2891B）/' +
      'ETF（例如 00919）的情境請改用這支，不要用 GET /companies。範圍涵蓋上市（TWSE）＋上櫃（TPEx）的' +
      '一般股票，加上 TWSE 的特別股（isin_securities，目前 TPEx 特別股查無資料，不是 bug），再加上' +
      'sitca-ts 的全部 ETF（etf_basic_info）。興櫃／KY 股／全額交割股都不排除（最大範圍），查不到' +
      '簡稱的證券 companyName 會是 null。每筆 entry 帶 type（COMMON/PREFERRED/ETF），給前端做' +
      '導頁判斷用（不同類型詳情頁路由不同），不要用 symbol 格式自己猜。limit 這次要拿幾筆由呼叫端' +
      '自己依業務邏輯決定，本服務只負責上限（1000）；也提供 countOnly=true 只回總筆數，不用先拉' +
      '一批資料才知道總共幾筆。',
    tags: ['System'],
    request: { query: getSecuritiesQuerySchema },
    responses: {
      200: {
        description: 'countOnly=true 時是 { count }；否則是 { count, limit, offset, entries }，count 一律是全部符合條件的總筆數（不是這次回傳的筆數）。',
        content: {
          'application/json': { schema: z.union([securitiesListResultSchema, securitiesCountOnlyResultSchema]) },
        },
      },
      400: { description: 'limit/offset 不合法。' },
    },
  });
};
