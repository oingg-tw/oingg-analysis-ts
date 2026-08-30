import { Router } from 'ultimate-express';
import { getBeta } from './controller';

const router = Router();

/**
 * @swagger
 * /portfolio/beta:
 *   get:
 *     summary: 計算單一公司相對加權股價指數（TAIEX）的貝塔係數（1Y/2Y/5Y）
 *     description: >
 *       直接讀取 oingg-twse 已寫入資料庫的個股日成交（`daily_price`）與加權股價指數
 *       （`daily_taiex_index`）計算，本服務本身不向任何來源抓取股價資料，若查無資料請先確認
 *       oingg-twse 那邊有沒有這個資料源。
 *
 *       **覆蓋率會持續成長**（6 家種子公司 2330/2881/2867/2801/2207/2855 回填了約 5 年歷史，
 *       其他公司多半只有近幾個月），查詢範圍外的公司會回傳
 *       `fieldStatuses` 標註 `not_applicable`，不是伺服器錯誤，也不是查無資料待補——是這張表
 *       目前的覆蓋率限制，見 [`../README.md`](../README.md) 說明。
 *
 *       計算口徑：
 *       - Beta = Cov(個股報酬率, 指數報酬率) / Var(指數報酬率)，樣本共變異數/變異數（分母 n-1）。
 *       - **三個窗口取樣頻率不同**：1Y 用日資料、2Y 用週資料（對齊 Bloomberg 常見做法）、
 *         5Y 用月資料（對齊 Yahoo Finance 常見做法）——長窗口用日資料會把雜訊/非同步交易的短期
 *         波動也算進長期結構性風險，不是業界慣例，2026-08-26 改用降頻取樣。
 *       - 只用「股價與指數都有資料」的重疊交易日序列，先切窗口日期範圍再降頻（週用 ISO
 *         週最後一個重疊交易日代表，月用當月最後一個重疊交易日代表），最後用降頻後相鄰兩點算報酬率——
 *         不是各自序列自己的前一筆，避免其中一邊缺某一天資料時報酬率算法對不齊。
 *       - 1Y/2Y/5Y 三個窗口各自獨立計算（基準日往前 N 個日曆年再降頻），不是拿短窗口的資料去湊長窗口。
 *       - 基準日（`asOfDate`）= 股價與指數都有資料的最新一個重疊交易日，或指定日期往前最近的重疊交易日。
 *       - 降頻後取樣點數少於 20 個（19 個報酬率樣本）視為樣本數不足，不計算，`fieldStatuses`
 *         標註 `calculation_error`；5 年窗口容易卡在指數資料比股價資料舊，重疊區間比想像中短。
 *       - `fieldStatuses` 是 2026-08-26 起新指標開始採用的規範（見
 *         [`../../../shared/metricStatus.ts`](../../../shared/metricStatus.ts)），標註每個值為 null
 *         的欄位是「查無資料」「不適用」還是「算不出有意義的值」——其他既有指標還沒有回頭套用這個規範。
 *     tags:
 *       - Portfolio
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: 公司代號（6 家種子公司歷史深度最完整，其他公司覆蓋率會持續成長）
 *         example: "2330"
 *       - in: query
 *         name: asOfDate
 *         schema:
 *           type: string
 *           format: date
 *         description: 選填，格式 YYYY-MM-DD；不給就抓最新一個重疊交易日
 *     responses:
 *       200:
 *         description: >
 *           計算結果。若查無資料、不適用、或算不出有意義的值，對應欄位會是 null，
 *           `fieldStatuses` 會標明原因分類，`warnings` 是人類可讀的完整說明，
 *           不會回傳錯誤狀態碼（因為這些都是正常情境，非伺服器錯誤）。
 *       400:
 *         description: 請求的參數格式錯誤。
 */
router.get('/beta', getBeta);

export default router;
