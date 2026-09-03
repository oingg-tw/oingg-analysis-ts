import { Router } from 'ultimate-express';
import { getMaterialAnnouncements } from './controller';

const router = Router();

/**
 * @swagger
 * /market/material-announcements:
 *   get:
 *     summary: 上市公司重大訊息公告
 *     description: >
 *       上市公司每日重大訊息公告，取最近公告的前 limit 筆（依公告日期、公告時間由新到舊），
 *       不是固定某一天的資料。`announcementTime` 是來源原始字串格式（例如 "70003"），不是
 *       標準 HH:MM:SS，本服務不嘗試解析/重新格式化。
 *     tags:
 *       - Market
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: 預設 20，上限 50。
 *     responses:
 *       200:
 *         description: 最近公告的重大訊息清單。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/market/material-announcements', getMaterialAnnouncements);

export default router;
