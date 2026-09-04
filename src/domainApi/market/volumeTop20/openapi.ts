import { registry } from '@/adapters/swagger/registry';
import { volumeTop20ResultSchema } from './types';

export const registerVolumeTop20OpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/market/volume-top20',
    summary: '全市場成交量前 20 名（上市+上櫃合併）',
    description:
      '最新一個交易日，合併 twse-ts（上市）/tpex-ts（上櫃）官方各自算好的成交量前 20 後重新排序取全市場前 20，market 欄位標示來源。' +
      'TPEx 版本欄位比 TWSE 精簡（只有 symbol/trade_date/rank/volume），沒有的欄位（transaction/open/high/low/close/dir/change）回傳 null。' +
      '⚠️ 沒有排除 ETF/衍生性商品，回傳的是原始排名（跟本服務其他主打「上市公司證券」的排行榜不一樣，這支是應使用者要求刻意保留原樣）。' +
      'changePercent 是單日漲跌幅，本服務自己用 daily_price 算的點對點百分比（不是來源的 dir/change，確保上市/上櫃算法一致），' +
      '資料不足時是 null。',
    tags: ['Market'],
    responses: {
      200: { description: '成交量前 20 名。', content: { 'application/json': { schema: volumeTop20ResultSchema } } },
    },
  });
};
