import { registry } from '@/adapters/swagger/registry';
import { getDisposedStocksQuerySchema } from './controller';
import { disposedStocksResultSchema } from './types';

export const registerDisposedStocksOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/market/disposed-stocks',
    summary: '處置股票清單（上市+上櫃合併）',
    description:
      '合併 twse-ts（上市）/tpex-ts（上櫃）處置股票公告，market 欄位標示來源，只保留真正的上市/上櫃公司（比對 company_profile）。' +
      '稀疏資料，不是每天都有，取最近公告的前 limit 筆（依公告日期由新到舊），不是固定某一天的資料。TPEx 版本欄位比 TWSE 精簡' +
      '（沒有 announcementCount/dispositionMeasures/linkInformation），沒有的欄位回傳 null。sixDayChangePercent 是以 announceDate ' +
      '為基準日的近6個交易日累積漲跌幅，點對點比較（基準日收盤 vs 往前數6個交易日收盤），不是逐日漲跌幅相加，隱含複利效應；' +
      '資料不足6個交易日時是 null。reasonTimes 是從 reason 解析出的次數（例如「連續五次」→5、「最近10個營業日內有6個營業日」→6），' +
      '部分處置原因（例如可轉債標的證券）本身沒有次數概念，這時是 null。reasonShort 是從 reason 解析出的中文短標籤（例如引用「第一款」→' +
      '「漲跌異常」、可轉換公司債標的證券→「轉(交)換公司債」），解析不出來時是 null。dispositionStartDate/dispositionEndDate 是從 ' +
      'dispositionPeriod 拆出的西元起訖日期，dispositionPeriod 原始字串仍然保留，解析不出來時兩個新欄位都是 null。',
    tags: ['Market'],
    request: { query: getDisposedStocksQuerySchema },
    responses: {
      200: { description: '最近公告的處置股票清單。', content: { 'application/json': { schema: disposedStocksResultSchema } } },
      400: { description: '請求的參數格式錯誤。' },
    },
  });
};
