import { registry } from '@/adapters/swagger/registry';
import { getMarginShortRatioRankingQuerySchema } from './controller';
import { marginShortRatioRankingResultSchema } from './types';

export const registerMarginShortRatioRankingOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/market/margin-short-ratio-ranking',
    summary: '券資比排行',
    description:
      '券資比 = 融券今日餘額 / 融資今日餘額 x 100，是籌碼面「軋空/放空熱度」的常用指標——比值愈高代表放空的人相對融資買進的人愈多，' +
      '籌碼愈集中在空方，有機會出現軋空。融資餘額是 0 或查無融券資料的公司排除在外（分母不能是 0），不是回傳無限大或 0。' +
      '取最新一個交易日，依比值由高到低排序。',
    tags: ['Market'],
    request: { query: getMarginShortRatioRankingQuerySchema },
    responses: {
      200: { description: '前 limit 名的券資比排行。', content: { 'application/json': { schema: marginShortRatioRankingResultSchema } } },
      400: { description: '請求的參數格式錯誤。' },
    },
  });
};
