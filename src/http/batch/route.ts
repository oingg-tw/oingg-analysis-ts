import { Router } from 'ultimate-express';
import dailyRouter from './daily/route';
import quarterlyRouter from './quarterly/route';

// 2026-09-05 起薄殼合併層——實際路由掛載在 ./daily/route.ts、./quarterly/route.ts
// （各自獨立的 rate limiter 實例，見那兩支檔案的說明）。src/routes.ts 只認這個檔案，
// 不用知道底下拆成兩個資料夾。
const router = Router();
router.use(dailyRouter);
router.use(quarterlyRouter);

export default router;
