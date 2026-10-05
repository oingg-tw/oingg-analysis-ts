import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { brokersResultSchema } from '@/application/brokers/brokers';

export const registerBrokersOpenApi = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'get',
    path: '/brokers',
    summary: '證券商總公司名單（券商下拉選單用）',
    description:
      '來源是證交所 OpenAPI 的證券商總公司基本資料（/brokerService/brokerList）與證券商基本資料（t187ap18），由 twse-ts 每日鏡像（export.broker）。' +
      '只列營業中（出現在最新一次抓取）且業務種類含經紀的總公司，依代號排序；只做自營的期貨商（元大期貨等 4 家）不列。只用於顯示與選擇，不參與任何計算。',
    tags: ['Securities'],
    responses: { 200: { description: '證券商名單。', content: { 'application/json': { schema: brokersResultSchema } } } },
  });
};
