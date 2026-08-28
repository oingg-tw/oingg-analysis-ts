import { Router } from 'ultimate-express';
import { getGrahamNumber } from './controller';

const router = Router();

/**
 * @swagger
 * /guru/graham-number:
 *   get:
 *     summary: 計算單一公司單季葛拉漢數（Graham Number）
 *     description: >
 *       本服務第一個「複合指標」——直接引用已經做好的 GET /profitability/eps 跟
 *       GET /profitability/bvps 兩支服務算出來的值，不重複實作淨利/權益口徑選擇、
 *       流通股數查詢那些邏輯。呼叫這支 API 時，eps/bvps 服務也會各自照常把自己的計算結果
 *       upsert 進 profitability_eps/profitability_bvps，這是預期的副作用，不是意外。
 *
 *       計算口徑：
 *       - 葛拉漢數 = sqrt(22.5 x EPS(TTM) x BVPS)。
 *       - 出處：葛拉漢認為本益比不超過 15 倍、股價淨值比不超過 1.5 倍的股票才算便宜，
 *         兩者乘積上限 15 x 1.5 = 22.5，推導出合理價上限 sqrt(22.5 x EPS x BVPS)。
 *       - EPS 用 TTM（近四季滾動），不是單季或簡單年化版本。
 *       - EPS 或 BVPS 為零或負值時無法計算（公式假設公司要有正的獲利跟正的淨值），會在 warnings 註明。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季
 *       （eps/bvps 兩個組成指標各自需要的表的聯集，不是任一張表自己的最新一季，不同公司財報申報
 *       進度不同步，見 src/shared/latestQuarter.ts）。解析出來的具體季度會原樣傳給 eps/bvps，
 *       兩者不會各自再解析出不同季度。只給其中一個視為無效請求（400）。查無任何一季兩張表都有
 *       資料時，year/season 回傳 null。
 *     tags:
 *       - Guru
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: 公司代號
 *         example: "2330"
 *       - in: query
 *         name: year
 *         schema:
 *           type: string
 *         description: 民國年，選填（不給就自動抓最新一季，需與 season 成對）
 *         example: "115"
 *       - in: query
 *         name: season
 *         schema:
 *           type: string
 *           enum: ["1", "2", "3", "4"]
 *         description: 季度，選填（不給就自動抓最新一季，需與 year 成對）
 *         example: "2"
 *       - in: query
 *         name: dataType
 *         schema:
 *           type: string
 *           enum: ["1", "2"]
 *           default: "2"
 *         description: 1 = 個體, 2 = 合併，預設 2
 *       - in: query
 *         name: subsidiaryCompanyId
 *         schema:
 *           type: string
 *           default: ""
 *         description: 子公司代號，查詢母公司本身時留空
 *     responses:
 *       200:
 *         description: >
 *           計算結果。若資料庫查無資料或關鍵欄位為 null，對應欄位會是 null，
 *           原因會列在 warnings 中，不會回傳錯誤狀態碼（因為「查無資料」是正常情境，非伺服器錯誤）。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/graham-number', getGrahamNumber);

export default router;
