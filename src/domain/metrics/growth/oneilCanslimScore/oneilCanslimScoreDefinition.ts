import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-20 使用者要求把 O'Neil CAN SLIM 裡能用財報算的條件合併成一支複合指標（比照 piotroskiFScore
// 的「計分卡 + 徽章」做法，不去擴充 MetricBadge 的門檻型別）。七個字母裡 N（新產品/新高）、S（籌碼
// 供需）、L（IBD 專有的相對強度評等）、I（法人持股，本站 2026-09 才開始收沒有歷史）、M（大盤方向，
// 不是個股屬性）都算不出來，剩下 C 與 A 共四條，全部復用既有指標的計算：
//   C-1 當季 EPS 較去年同季 ≥ 25%        ← epsGrowthRate.Q
//   C-2 當季營收較去年同季 ≥ 25%         ← revenueGrowthRate.Q
//   A-1 過去三年 EPS 年化成長 ≥ 25%       ← epsCagr3y.FY
//   A-2 ROE ≥ 17%                        ← roe.TTM
// 值 = 四條通過幾條（0-4）。任一條算不出來（value 為 null）整支就是 null——跟 Piotroski「訊號需全部
// 可判斷才有分數」同一套規則，不會拿 3/3 冒充 3/4。目前全市場季報歷史只到 113Q1，A-1 的三年 CAGR
// 要四個完整年度，2026-09-20 只有約 150 家算得出來（2330 有完整歷史），其餘公司這支指標會落在
// insufficient_history，這是資料深度問題不是指標問題，歷史回填往前補之後會自然變多。
//
// 實作上不是讀 metric_values 裡四支子指標已寫入的值（全市場回填是 Promise.allSettled 平行跑，讀庫
// 會跟同批次的寫入競賽），而是在程序內直接呼叫四支子指標的 compute 函式拿 slot（見
// computeOneilCanslimScore.ts）——不重寫任何一條公式，座標由這支先解析好再傳進去，四條天然對齊
// 同一季。knowledge date 取四條的最大值（跟 TTM 加總的傳染規則一致）。
export const oneilCanslimScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'oneilCanslimScore',
  name: "O'Neil CAN SLIM 基本面評分",
  nameEn: "O'Neil CAN SLIM Fundamentals Score",
  unit: '分',
  formulaNote:
    'CAN SLIM 七條裡能用財報算的四條（C-1 當季 EPS 年增 ≥25%、C-2 當季營收年增 ≥25%、A-1 三年 EPS ' +
    '年化成長 ≥25%、A-2 ROE ≥17%）通過數加總（0-4）。四條分別復用 epsGrowthRate.Q、revenueGrowthRate.Q、' +
    'epsCagr3y.FY、roe.TTM 的既有計算，不另寫公式；任一條 value 為 null 則整支為 null（nullReason 沿用' +
    '那一條的原因，A-1 缺歷史時是 insufficient_history）。只有 Q 一種 basis。N/S/L/I/M 五條（新產品、' +
    '籌碼供需、IBD 相對強度評等、法人持股、大盤方向）本站沒有資料或不是個股屬性，不在計分範圍。',
  formulaLatex:
    "\\mathrm{CANSLIM} = [\\mathrm{EpsGrowthRate} \\geq 25] + [\\mathrm{RevenueGrowthRate} \\geq 25] + [\\mathrm{EpsCagr}_{3y} \\geq 25] + [\\mathrm{ROE} \\geq 17]",
  referenceUrl: 'https://en.wikipedia.org/wiki/CAN_SLIM',
  tier: 'composite',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司資產負債表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['epsGrowthRate', 'revenueGrowthRate', 'epsCagr3y', 'roe'],
  currentFormulaVersion: 1,
};
