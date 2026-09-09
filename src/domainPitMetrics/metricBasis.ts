import { z } from 'zod';

// 2026-09-08：原本這裡是單一 `basis` 欄位/enum，塞了三組語意完全不同的概念——使用者判斷
// 這違反 ubiquitous language（「basis」在會計裡是保留字，cash basis/accrual basis 指的是
// 做帳慣例，不是這裡要表達的「這個數字在時間維度上是怎麼算出來的」），拆成四個獨立欄位/enum，
// 各自精準命名，並把值對齊 Bloomberg/FactSet/S&P/LSEG 等主流終端的慣例：
//   - CUM → YTD（國際一律用 YTD，CUM 只在東亞本地系統出現）
//   - 1Y_DAILY 這類複合值 → 拆成 lookbackRange × samplingInterval 兩個正交維度
//     （對齊行情 API 的 range=2y&interval=1wk 參數化慣例，不綁成一個 enum）
//   - DAILY → EOD（End-of-Day，收盤資料的標準寫法）
// DB 欄位（metric_values 的四個欄位）刻意都用 String 而不是 Postgres enum：這組字彙要能
// 「擴充不動 schema」，加新值只要在這裡加一個字面值即可。四個欄位都是 NOT NULL + sentinel
// 值 'N/A'（不是 nullable）——延續 fiscalQuarter 那次的教訓：Postgres UNIQUE 約束把 NULL
// 視為互不相等，nullable 欄位放進複合唯一鍵會讓「同一組座標該擋重複」的保護失效，sentinel
// 字串值沒有這個問題。任何一列只會有其中「一組」欄位是真實值（periodType 單獨一組；
// lookbackRange + samplingInterval 成對一組；snapshotCadence 單獨一組），其餘固定 'N/A'。

// periodType：季報型指標的「期間聚合方式」——描述一個數字是怎麼從財報的季度資料聚合出來的。
// Q(單季，Bloomberg FQ / FactSet QTR) / YTD(年初累計) / TTM(近四季，投行慣稱 LTM，計算等價) /
// Q_ANN(單季簡易年化=單季×4，**不是** SAAR，沒有季節調整，業界沒有直接對應概念，是本專案
// 刻意的簡化) / FY(整年)。非本組指標填 'N/A'。
export const periodTypeSchema = z.enum(['N/A', 'Q', 'YTD', 'TTM', 'Q_ANN', 'FY']);
export type PeriodType = z.infer<typeof periodTypeSchema>;

// lookbackRange / samplingInterval：逐日型滾動統計量（目前只有 Beta）的「回溯範圍」與
// 「取樣粒度」兩個正交維度——描述一個滾動統計量是拿多長的歷史、用什麼頻率取樣的報酬率序列
// 算出來的，跟 periodType 的「財報期別」完全是不同問題。兩者要嘛同時是真實值、要嘛同時是
// 'N/A'（結構性不變式，metricValueWriter.ts 會擋）。目前實際計算的三種組合對應業界標準 Beta
// 視窗：1Y×1D（252 個交易日，年化波動率/52 週動量基準）、2Y×1W（Bloomberg BETA 頁面與
// Barra 預設，104 週）、5Y×1M（Morningstar / S&P 長期 Beta 標準，60 個月）。允許值刻意不
// 綁死組合——正交參數化的意義就是之後要加新組合不用改 enum。
export const lookbackRangeSchema = z.enum(['N/A', '1Y', '2Y', '5Y']);
export type LookbackRange = z.infer<typeof lookbackRangeSchema>;
export const samplingIntervalSchema = z.enum(['N/A', '1D', '1W', '1M']);
export type SamplingInterval = z.infer<typeof samplingIntervalSchema>;

// snapshotCadence：逐日型指標的「單純快照，沒有聚合也沒有滾動視窗」（目前只有
// exchangePeRatio/exchangePbRatio/dividendYield 使用）——這批數字是直接沿用 TWSE/TPEx
// 官方每日公布的權威數字 passthrough，不自己重算。EOD = End-of-Day，收盤值。非本組指標填 'N/A'。
export const snapshotCadenceSchema = z.enum(['N/A', 'EOD']);
export type SnapshotCadence = z.infer<typeof snapshotCadenceSchema>;

// coordinateKind：2026-09-08 補的顯式 discriminator——「這一列屬於四組座標欄位裡的哪一組」
// 原本要靠推導（看哪個欄位不是 'N/A'），這個欄位讓它變成一個顯式、可查詢、可加 DB CHECK
// 約束的值，不用每個消費端各自重寫一次 isRealGroup() 判斷。跟四個 basis 欄位一樣寫進
// metric_values 的複合唯一鍵沒有意義（已經被那四欄唯一決定），純粹是防禦深度：DB 層的
// CHECK 約束用它把「periodType 是這組時，另外三欄必須是 N/A」這條結構不變量從應用層
// （metricValueWriter.ts 的驗證）提升到 schema 層，防止有人繞過 writeMetricValue() 直接
// insert 出不一致的列。
export const coordinateKindSchema = z.enum(['PERIOD', 'ROLLING_WINDOW', 'SNAPSHOT']);
export type CoordinateKind = z.infer<typeof coordinateKindSchema>;

// 只有 value 為 null 時才有意義。
export const metricNullReasonSchema = z.enum([
  'missing_input',
  'zero_or_negative_denominator',
  'not_applicable_industry',
  'insufficient_history',
]);
export type MetricNullReason = z.infer<typeof metricNullReasonSchema>;
