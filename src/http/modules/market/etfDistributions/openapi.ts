import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { etfDistributionsResultSchema } from '@/application/market/etfDistributions/types';
import { getEtfDistributionsQuerySchema } from './route';

export const registerEtfDistributionsOpenApi = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'get',
    path: '/market/etf-distributions',
    summary: '單一 ETF 的逐次收益分配與近 12 個月配息',
    description:
      '來源是 sitca-ts 的 FundClear ETF 收益分配（fundclear_etf_dividend），跟 GET /stocks/ex-dividend-calendar 的 ETF 列同一份資料、' +
      '同一個已實現判斷（除息日早於今天）。events 是全部紀錄（含預告），trailing12MonthDistributionPerUnit 只加總近 12 個月已實現的。' +
      '個股與特別股的股利請用 GET /companies/dividend-history（ETF 在那裡是空的：ETF 沒有股利所屬年度）。',
    tags: ['Market'],
    request: { query: getEtfDistributionsQuerySchema },
    responses: {
      200: { description: '逐次收益分配與近 12 個月加總；查無紀錄時 found=false、events 空陣列。', content: { 'application/json': { schema: etfDistributionsResultSchema } } },
      400: { description: '缺 symbol。' },
    },
  });
};
