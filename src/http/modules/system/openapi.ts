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
    summary: '健康檢查：服務與 analysis 資料庫是否可用',
    description:
      '2026-10-08 新增（bff-ts 要求）。不需要 X-Api-Key。對 analysis 資料庫跑一個最小查詢（3 秒逾時）：正常回 200；' +
      '資料庫沒醒或查詢失敗回 503（RFC 9457 problem+json）。Cloud Run 冷啟動時第一次可能接近 3 秒。',
    tags: ['System'],
    responses: {
      200: {
        description: '服務與資料庫都正常。',
        content: { 'application/json': { schema: z.object({ status: z.literal('ok'), database: z.literal('ok') }) } },
      },
      503: { description: '資料庫在 3 秒內沒有回應或查詢失敗。' },
    },
  });
};
