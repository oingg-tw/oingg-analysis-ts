import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-11 使用者要求：前端目前只會顯示這一個徽章（季報型 pegRatio 已經不掛
// badge），detail/summary 不要再用「跟季報型 pegRatio 比較」這種對照寫法——使用者
// 只看得到這一個徽章，提另一個看不到的版本只會造成混淆。改成直接、獨立地說明這支指標
// 本身：公式沿用 PEG 原始定義，計算基礎明講是「今天」的即時股價 + 最新公布財報的
// 基本面數據。
export const livePegRatioBadge: MetricBadge = {
  id: 'live-peg-ratio',
  name: '本益成長比',
  nameEn: 'PEG Ratio',
  author: 'Peter Lynch, 1989',
  summary: '本益比 ÷ 盈餘成長率，用今天的即時股價搭配最新公布財報的成長率數據計算，每個交易日更新。',
  detail:
    '傳奇基金經理人 Peter Lynch 在其著作《One Up on Wall Street》裡推廣的估值概念（PEG 這個' +
    '名稱/公式本身更早已在證券分析文獻中出現，但 Lynch 的書讓這個概念廣為投資大眾所知）：' +
    '單看本益比（PE）沒辦法反映一家公司的成長性——同樣是本益比 20 倍，一家成長率 30% 的' +
    '公司跟一家成長率 5% 的公司，合理的評價天差地遠。PEG = 本益比 ÷ 盈餘成長率（%，用' +
    '數字而非小數表示，例如成長率 15% 代入 15），把「股價貴不貴」跟「公司成長多快」放在' +
    '同一個比較基準上。計算基礎是「今天」的即時收盤價（決定本益比的分子），搭配公司最新' +
    '公布財報的 EPS 成長率，每個交易日都會隨股價變動更新。Lynch 的經驗法則是 PEG 等於 1' +
    '大致代表合理定價，明顯低於 1 代表相對於成長性而言股價可能偏低，高於 1（尤其遠高於）' +
    '則可能偏貴，這是一個經驗法則，不是嚴謹的學術估值模型。',
  token: 'EOD',
  threshold: {
    description: '< 1',
    thresholdLatex: '\\mathrm{LivePEG} < 1',
    note: 'Lynch 的經驗法則：PEG ≈ 1 大致代表合理定價，明顯低於 1 代表相對成長性而言股價偏低',
    denominator: 1,
    comparator: 'lt',
    value: 1,
  },
};
