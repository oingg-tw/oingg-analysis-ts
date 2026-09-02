import { Router } from 'ultimate-express';
import { getSecuritySymbolsHandler } from './controller';

const router = Router();

/**
 * @swagger
 * /securities/symbols:
 *   get:
 *     summary: 可交易證券代號清單（依市場/興櫃/KY 股等條件篩選）
 *     description: >
 *       2026-09-02 應使用者要求新增，原本是 `GET /companies/symbols`，搬過來是因為
 *       「能不能交易」本質上是證券層級的判斷，不是公司層級的——「公司」（`GET /companies`，
 *       company_profile 完整登記範疇，含臺銀證券這種非交易性質登記）跟「證券」（真正能交易的
 *       上市櫃標的）是兩個不同概念，不該共用同一支端點。mops-ts 之前用這支端點的清單做
 *       capital_stock_history 全市場回補。
 *
 *       基礎範圍固定是：TWSE 上市（排除證券商登記等非交易性質的 `COMPANY_PROFILE_PUBLIC`）+
 *       TPEx 上櫃（含興櫃，除非用 `includeEmerging=false` 排除）。回應是排序過、去重的字串
 *       陣列，不分頁（目前量級約 2,300 檔，payload 很小）。
 *
 *       `excludeFullDelivery`/`excludePreferredStock` 這兩個參數傳了不會 400、也不會靜默
 *       忽略——請求會照樣執行，`warnings` 會說明原因：`excludeFullDelivery` 是還沒有資料源
 *       支援（等 mops-ts/tpex-ts）；`excludePreferredStock` 則是沒有實際效果——這份清單的
 *       底層資料（company_profile）本來就不含特別股（特別股跟母公司共用同一個法人，沒有
 *       獨立登記），不是缺篩選邏輯。
 *     tags:
 *       - System
 *     parameters:
 *       - in: query
 *         name: market
 *         schema:
 *           type: string
 *           enum: [TWSE, TPEx]
 *         description: 不給就兩個市場都要。
 *       - in: query
 *         name: includeEmerging
 *         schema:
 *           type: boolean
 *           default: true
 *         description: 是否包含興櫃（只影響 TPEx）——興櫃沒有一般股價資料，但仍是合法登記、有公開揭露義務的公司。
 *       - in: query
 *         name: excludeKy
 *         schema:
 *           type: boolean
 *           default: false
 *         description: 是否排除 KY 股（境外註冊掛牌公司，簡稱以「-KY」結尾）。
 *       - in: query
 *         name: excludeFullDelivery
 *         schema:
 *           type: boolean
 *           default: false
 *         description: 是否排除全額交割股——目前沒有資料源支援，傳 true 只會在 warnings 說明，不會實際生效。
 *       - in: query
 *         name: excludePreferredStock
 *         schema:
 *           type: boolean
 *           default: false
 *         description: 是否排除特別股——沒有實際效果，這份清單的資料來源本來就不含特別股，傳 true 只會在 warnings 說明。
 *     responses:
 *       200:
 *         description: "`{ count, symbols, warnings }`"
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/securities/symbols', getSecuritySymbolsHandler);

export default router;
