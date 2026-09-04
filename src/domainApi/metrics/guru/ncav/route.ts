import { Router } from 'ultimate-express';
import { registerCompanyRoute } from '@/shared/registerCompanyRoute';
import { getNcav } from './controller';

const router = Router();

/**
 * @swagger
 * /guru/ncav:
 *   get:
 *     summary: 計算單一公司單季葛拉漢淨流動資產價值（NCAV）與安全邊際價
 *     description: >
 *       直接讀取 oingg-mops-ts 已寫入資料庫的資產負債表與股本歷史資料進行計算，本服務本身不向 MOPS 抓取資料，
 *       若資料庫中查無該季資料請先透過 oingg-mops-ts 的 ingest API 抓取。
 *
 *       計算口徑：
 *       - NCAV = (流動資產 - 總負債 - 特別股) / 流通股數。
 *       - 特別股只計入分類為權益的部分（preferredStockCapital）。分類為金融負債的特別股
 *         （preferredStockLiability，通常是可贖回特別股）已經算在總負債裡面，不會重複扣。
 *         查不到欄位（或本來就沒有特別股）視為 0，不是資料缺漏。
 *       - marginOfSafetyPrice（安全邊際價） = NCAV x (2/3)——葛拉漢認為用低於 NCAV 三分之二的
 *         價格買進才有足夠安全邊際。
 *       - 純資產負債表時點快照，沒有單季/年化/TTM 的區別。
 *       - **這個公式不適用金融/保險業**：這類公司的資產負債表不採流動/非流動分類，`currentAssets`
 *         查不到會直接回傳 null，這是正常情境，不是伺服器錯誤。
 *
 *       year/season 選填但要成對——不給就自動抓「這家公司資產負債表有資料」的最新一季
 *       （不同公司財報申報進度不同步，見 src/shared/sourceData/latestQuarter.ts）。
 *       只給其中一個視為無效請求（400）。查無任何一季有資料時，year/season 回傳 null。
 *     tags:
 *       - Guru
 *     parameters:
 *       - in: query
 *         name: symbol
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
registerCompanyRoute(router, '/ncav', getNcav);

export default router;
