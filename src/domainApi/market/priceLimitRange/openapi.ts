import { registry } from '@/adapters/swagger/registry';
import { priceLimitRangeResultSchema } from './types';

export const registerPriceLimitRangeOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/market/price-limit-range',
    summary: '漲跌停幅度最大/最小各 20 檔（上市+上櫃合併）',
    description:
      '最新一個交易日，合併 twse-ts（上市）/tpex-ts（上櫃）漲跌停幅度（limitRange = limitUp - limitDown）最大前 20（widest）、' +
      '最小前 20（narrowest），market 欄位標示來源。兩邊都已經先過濾成只留真正公司，這裡不用再濾一次。TPEx 版本欄位比 TWSE 精簡' +
      '（沒有 openingRefPrice/previousDayPrice/allowOddLotTrade），沒有的欄位回傳 null。',
    tags: ['Market'],
    responses: {
      200: { description: '漲跌停幅度最大/最小各前 20 檔。', content: { 'application/json': { schema: priceLimitRangeResultSchema } } },
    },
  });
};
