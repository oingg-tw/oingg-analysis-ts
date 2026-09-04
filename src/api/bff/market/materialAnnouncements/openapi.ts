import { registry } from '@/adapters/swagger/registry';
import { getMaterialAnnouncementsQuerySchema } from './controller';
import { materialAnnouncementsResultSchema } from './types';

export const registerMaterialAnnouncementsOpenApi = (): void => {
  registry.registerPath({
    method: 'get',
    path: '/market/material-announcements',
    summary: '上市公司重大訊息公告',
    description:
      '上市公司每日重大訊息公告，取最近公告的前 limit 筆（依公告日期、公告時間由新到舊），不是固定某一天的資料。' +
      'announcementTime 是來源原始字串格式（例如 "70003"），不是標準 HH:MM:SS，本服務不嘗試解析/重新格式化。',
    tags: ['Market'],
    request: { query: getMaterialAnnouncementsQuerySchema },
    responses: {
      200: { description: '最近公告的重大訊息清單。', content: { 'application/json': { schema: materialAnnouncementsResultSchema } } },
      400: { description: '請求的參數格式錯誤。' },
    },
  });
};
