import { z } from 'zod';

// DB 欄位是 String（見 schema.prisma 的 MetricValue.basis 註解），這裡做應用層驗證——
// 刻意不用 Postgres enum：這組字彙要能「擴充不動 schema」，加新值只要在這裡加一個字面值、
// 並在對應 metricDefinitionSpec.allowedBases 宣告即可，不用跑 migration。
//
// 目前是三組語意完全不同、恰好共用同一個欄位的字彙群組：
// 1. 季報型指標的「期間聚合方式」：Q(單季)/CUM(年初累計)/TTM(近四季)/Q_ANN(單季簡易
//    年化)/FY(整年)——描述一個數字是怎麼從財報的季度資料聚合出來的。
// 2. 逐日型指標的「滾動視窗＋取樣頻率」：1Y_DAILY/2Y_WEEKLY/5Y_MONTHLY（2026-09-08
//    新增，Beta 遷入 pitMetrics 的前提條件之一，設計定案但目前還沒有任何 metricCode
//    實際使用）——描述一個滾動統計量（目前只規劃給 Beta 係數，之後可能有其他滾動視窗
//    指標）是拿哪個時間長度、哪個取樣頻率的報酬率序列算出來的。這跟第 1 組「期間聚合
//    方式」是完全不同的問題——Beta 沒有「單季/近四季」這種財報期別概念，只有「拿幾年的
//    日/週/月報酬率回歸」這個選擇，只是剛好都需要用同一個 basis 欄位存，才放進同一個
//    enum。命名慣例是 <窗口長度><頻率>，對應業界常見的 Beta 三種標準視窗（1年日頻/2年
//    週頻/5年月頻）；之後真的動手寫 computeBetaPit.ts 時直接用這三個值，不要另創新命名。
// 3. 逐日型指標的「單純快照，沒有聚合也沒有滾動視窗」：DAILY（2026-09-08 新增，
//    MarketRatios 遷入 pitMetrics 的方法論決策一部分——per/pbr/dividendYield 決定沿用
//    TWSE/TPEx 官方每日公布的權威數字 passthrough，不自己重算，數字本身就是「這個交易日
//    交易所說的值」，沒有 Q/CUM/TTM 那種「怎麼聚合」的問題，也沒有 Beta 那種「拿幾年
//    資料回歸」的問題，是三組字彙裡最單純的一種）。之後 exchangePeRatio/exchangePbRatio/
//    dividendYield 這三個規劃中的 metricCode（見 metricDefinitionRegistry.ts 頂部的
//    MarketRatios 遷移方法論記錄）應該用這個值，不要誤用 Q（Q 隱含「這是從季報聚合出來
//    的」，跟這三個指標的資料來源語意不符）。
export const metricBasisSchema = z.enum(['Q', 'CUM', 'TTM', 'Q_ANN', 'FY', '1Y_DAILY', '2Y_WEEKLY', '5Y_MONTHLY', 'DAILY']);
export type MetricBasis = z.infer<typeof metricBasisSchema>;

// 只有 value 為 null 時才有意義。
export const metricNullReasonSchema = z.enum([
  'missing_input',
  'zero_or_negative_denominator',
  'not_applicable_industry',
  'insufficient_history',
]);
export type MetricNullReason = z.infer<typeof metricNullReasonSchema>;
