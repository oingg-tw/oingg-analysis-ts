import { registry } from '@/adapters/swagger/registry';
import { getForeignHoldingRankingQuerySchema } from './controller';
import { foreignHoldingRankingResultSchema } from './types';

export const registerForeignHoldingRankingOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/market/foreign-holding-ranking',
    summary: '外資持股加碼/減碼排行',
    description:
      '比較最近兩個交易日的外資持股比例（shares_held_percent，佔已發行股數的百分比），依「百分點變動」排序，不是持股張數的變動幅度——' +
      '張數會被增減資干擾，比例才是市場慣用的「外資加碼/減碼」定義。limit 是固定筆數（加碼、減碼各取前 limit 筆），不是百分比，' +
      '母數是兩個交易日都有資料、可以比較的公司數（eligibleCompanyCount）。',
    tags: ['Market'],
    request: { query: getForeignHoldingRankingQuerySchema },
    responses: {
      200: { description: '加碼/減碼各前 limit 筆的公司清單。', content: { 'application/json': { schema: foreignHoldingRankingResultSchema } } },
      400: { description: '請求的參數格式錯誤。' },
    },
  });
};
