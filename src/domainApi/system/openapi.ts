import { z } from 'zod';
import { registry } from '@/adapters/swagger/registry';

export const registerSystemOpenApi = (): void => {
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
};
