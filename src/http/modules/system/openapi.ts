import { z } from 'zod';
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

export const registerSystemOpenApi = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'get',
    path: '/',
    summary: 'Get server status and startup time',
    description: 'Returns a welcome message and the time it took for the server to initialize.',
    tags: ['System'],
    responses: {
      200: {
        description: 'Server status and startup time.',
        content: {
          'application/json': {
            schema: z.object({
              startupTime: z.string().meta({ example: 'Server startup time: 123.45ms' }),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/health',
    summary: '健康檢查：服務、analysis 資料庫與各上游 export 庫是否可用',
    description:
      '2026-10-08 新增（bff-ts 要求）。不需要 X-Api-Key。對 analysis 資料庫跑一個最小查詢，並對 mops／gov／tpex／twse／sitca 各探測一個代表 view' +
      '（只檢查存在與讀取權限、不讀資料），全部平行、3 秒逾時：都正常回 200；任何一個沒醒、查詢失敗或 view 不存在回 503' +
      '（RFC 9457 problem+json，detail 列出是哪幾個）。Cloud Run 冷啟動時第一次可能接近 3 秒。',
    tags: ['System'],
    responses: {
      200: {
        description: '服務與資料庫都正常。',
        content: { 'application/json': { schema: z.object({ status: z.literal('ok'), database: z.literal('ok') }) } },
      },
      503: { description: 'analysis 資料庫或任一上游 export 庫在 3 秒內沒有回應、查詢失敗或代表 view 不存在（detail 列出是哪幾個）。' },
    },
  });
};
