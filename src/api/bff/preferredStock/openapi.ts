import { registry } from '@/adapters/swagger/registry';
import { getPreferredStocksQuerySchema } from './controller';
import { preferredStocksResultSchema } from './types';

export const registerPreferredStockOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/preferred-stocks',
    summary: '特別股清單（發行條款 + 目前殖利率）',
    description:
      '特別股本身是獨立證券（例如 1101 台泥的普通股 vs 1101B 台泥乙特是兩檔不同證券），跟' +
      '「一家公司+季度財報」骨架的一般指標端點不合，獨立成一支平行分類。symbol 選填，給了' +
      '就只回那一檔（查無資料回 entries: []，不是 404），不給就回全部目前上市中的特別股' +
      '（2026-09-06 實測共 28 檔）。只涵蓋 TWSE（上市）——TPEx 目前沒有對應的證券登記資料，' +
      '上櫃特別股（如果存在）沒有資料源。' +
      'dividendRate 是「每股固定配息金額」（新台幣元），不是百分比，欄位名稱容易誤會。' +
      '這裡算兩個不同的百分比：nominalDividendRatePct（票面利率，dividendRate/issuePrice，' +
      '發行時基準，之後不隨股價變動）跟 currentYieldPct（目前殖利率，dividendRate/最新收盤價，' +
      '隨股價每天變動，查無股價資料時為 null）——兩者是不同概念，票面利率偏高不代表現在買進的' +
      '殖利率也高（例如 2002A 中鋼特票面利率 14% 是 1974 年發行當時的利率環境）。',
    tags: ['Stocks'],
    request: { query: getPreferredStocksQuerySchema },
    responses: {
      200: { description: '特別股清單，查無資料（symbol 篩選後沒有結果）時 entries 是空陣列。', content: { 'application/json': { schema: preferredStocksResultSchema } } },
      400: { description: 'symbol 格式錯誤。' },
    },
  });
};
