import { registry } from '@/adapters/swagger/registry';
import { getRevenueRankingQuerySchema } from './controller';
import { revenueRankingResultSchema } from './types';

export const registerRevenueRankingOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/market/revenue-ranking',
    summary: '月營收排行（上市+上櫃合併）',
    description:
      '取最新一個月份的月營收資料排行，合併 twse-ts（上市）/tpex-ts（上櫃）兩邊來源，market 欄位標示來源，只留上市或上櫃公司' +
      '（monthly_revenue 來源範圍是「公開發行公司」，比上市櫃更廣，不篩選會混進非上市櫃公司）。metric 目前只接受 yoy' +
      '（年增率，最常見的「營收爆發」選股指標）——2026-09-13 拔掉 mom（月增率排行，波動太大容易受季節性因素干擾）跟' +
      'revenue（單純營收金額排行，偏向大型權值股，沒有「成長」意涵），這兩者被判定沒有實際選股價值，momChangePercent/' +
      'currentMonthRevenue 仍保留在回應列裡當參考資訊，只是不能拿來排序。會排除 yoyChangePercent 超過 300% 的公司——' +
      '這是前期基期趨近於零造成的統計失真（例如建案交屋、生技授權金等認列時點集中的產業特性），不是真實的營運成長，' +
      '300% 這個門檻依據是使用者提供的分析文件，之後有多年歷史資料可以改用更嚴謹的「基期 vs 歷史中位數」判斷。',
    tags: ['Market'],
    request: { query: getRevenueRankingQuerySchema },
    responses: {
      200: { description: '前 limit 名的月營收排行。', content: { 'application/json': { schema: revenueRankingResultSchema } } },
      400: { description: '請求的參數格式錯誤。' },
    },
  });
};
