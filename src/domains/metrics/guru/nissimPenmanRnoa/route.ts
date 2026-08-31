import { Router } from 'ultimate-express';
import { getNissimPenmanRnoa } from './controller';

const router = Router();

/**
 * @swagger
 * /guru/nissim-penman-rnoa:
 *   get:
 *     summary: 計算單一公司 Nissim & Penman RNOA 拆解
 *     description: >
 *       Doron Nissim 與 Stephen Penman（2001）提出的 ROE 拆解模型：`ROE = RNOA + (FLEV x SPREAD)`，
 *       把 ROE 拆成「本業活動賺的報酬」（RNOA）跟「財務槓桿放大的部分」（FLEV x SPREAD），
 *       用來揪出「ROE 很高但其實是借錢堆出來的」公司。
 *
 *       計算口徑：
 *       - `RNOA`（本業報酬率） = `NOPAT / NOA`；`NOPAT`（稅後淨營業利潤） = `營業利益 x (1 - 有效稅率)`，
 *         有效稅率 = `所得稅費用 / 稅前淨利`，稅前淨利為零或負數時無法計算。
 *       - `NOA`（淨營業資產） = `權益 + NFO`；`NFO`（淨金融負債） = `有息負債（短期借款+應付公司債+長期借款）
 *         - 現金及約當現金`——財報沒有「營業 vs 融資」的分類欄位，用「總權益 + 淨金融負債」這個數學
 *         恆等式取代逐科目分類，見 [`../README.md`](../README.md) 的推導。
 *       - `FLEV`（財務槓桿） = `NFO / 權益`，純資產負債表時點快照，單季/TTM 共用同一個值，是原始比率
 *         （倍數）不是百分比。
 *       - `NBC`（淨借貸利率） = `稅後利息費用 / NFO`（利息費用用跟 NOPAT 相同的有效稅率扣掉稅盾效果，
 *         不是直接用稅前的利息費用——否則 RNOA + FLEV x SPREAD 這個恆等式會系統性偏離實際 ROE）；
 *         `SPREAD` = `RNOA - NBC`。
 *       - `reconstructedRoeQuarterlyPct`/`reconstructedRoeTtmPct` 是用 `RNOA + FLEV x SPREAD` 重新組裝
 *         出來的 ROE，理論上應該接近（不必完全相等）`GET /profitability/roe` 直接算出來、原樣回傳的
 *         `actualRoeQuarterlyPct`/`actualRoeTtmPct`——兩者對照可以互相驗證拆解邏輯是否一致，小數點誤差
 *         是四捨五入造成的正常現象，跟 `GET /profitability/dupont` 的交叉驗證設計同一個精神。
 *       - 本服務第三個「不是 taxonomy 明列 code」的複合指標——不自己重複實作損益表/資產負債表查詢
 *         邏輯，而是額外呼叫 `calculateRoe` 取得 `actualRoeQuarterlyPct`/`actualRoeTtmPct` 這兩個
 *         對照用的數字（副作用是 `roe/` 也會照常把自己的結果 upsert 進 `profitability_roe`）。
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
 *         description: 民國年，選填（不給就自動抓「這家公司資產負債表跟損益表都有資料」的最新一季，需與 season 成對）
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
 *           `fieldStatuses` 會標明原因分類，`warnings` 是人類可讀的完整說明，
 *           不會回傳錯誤狀態碼（因為「查無資料」是正常情境，非伺服器錯誤）。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/nissim-penman-rnoa', getNissimPenmanRnoa);

export default router;
