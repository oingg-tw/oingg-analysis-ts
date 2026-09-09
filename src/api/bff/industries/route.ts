import { Router } from 'ultimate-express';
import { getIndustryTree, getIndustryFlat } from './controller';

const router = Router();

router.get('/industries/tree', getIndustryTree);
router.get('/industries/flat', getIndustryFlat);

// 2026-09-09 暫時關閉——tpex-ts 事後發現 ic.tpex.org.tw 的使用條款（disclaimer.php 第七條）
// 明文要求轉載/重製網站內容前要先取得 TPEx/TWSE 事前書面同意，跟一般開放給程式化存取的
// TPEx OpenAPI 性質不同。export.company_industry_chain 目前是「內部測試用，還沒取得對外
// 授權」狀態，這支端點對外開放等於把未經授權轉載的內容再轉發給 bff-ts/web-nuxt，在取得
// 書面同意之前不能對外開放。getIndustryValueChain/getValueChainNode 的程式碼保留，
// 之後取得授權後把這行復原即可，不用重寫。
// router.get('/industries/value-chain', getIndustryValueChain);

export default router;
