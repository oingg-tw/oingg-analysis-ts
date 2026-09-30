import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { upstreamChangesBodySchema, upstreamChangesResultSchema } from './schemas';

export const registerUpstreamOpenApi = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'post',
    path: '/upstream/changes',
    summary: '上游（mops／tpex／twse）通知 analysis 有新的資料變動',
    description:
      '只給 mops-ts、tpex-ts、twse-ts 呼叫，不是給 bff-ts 的。通知只帶「處理到 export.row_changes 的第幾筆」，明細留在上游；' +
      'analysis 存成待辦並叫醒處理程式，處理程式讀那一段明細、換算要重算的公司與期間、只重算那些。' +
      '冪等：upToId 小於或等於這個來源已收過的值時回 200、不做事，所以重送、亂序、漏送一次都沒關係（下一次會涵蓋）。' +
      '驗證：Cloud Run IAM（Google ID token）＋每個來源自己的 X-Upstream-Key。',
    tags: ['Upstream'],
    request: { body: { content: { 'application/json': { schema: upstreamChangesBodySchema } } } },
    responses: {
      202: { description: '已入列（queued=true）', content: { 'application/json': { schema: upstreamChangesResultSchema } } },
      200: { description: '重複或較舊的 upToId，沒做事（queued=false）', content: { 'application/json': { schema: upstreamChangesResultSchema } } },
      401: { description: '這個來源的 X-Upstream-Key 不對或沒帶' },
    },
  });
};
