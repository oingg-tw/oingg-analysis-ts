import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

export const pegRatioBadge: MetricBadge = {
  id: 'peg-ratio',
  name: '本益成長比',
  nameEn: 'PEG Ratio',
  author: 'Peter Lynch, 1989',
  summary: '本益比除以盈餘成長率，衡量股價相對於公司成長性而言是否合理，數值越低代表相對成長性越便宜。',
  detail:
    '傳奇基金經理人 Peter Lynch 在其著作《One Up on Wall Street》裡推廣的估值概念（PEG 這個' +
    '名稱/公式本身更早已在證券分析文獻中出現，但 Lynch 的書讓這個概念廣為投資大眾所知）：' +
    '單看本益比（PE）沒辦法反映一家公司的成長性——同樣是本益比 20 倍，一家成長率 30% 的' +
    '公司跟一家成長率 5% 的公司，合理的評價天差地遠。PEG = 本益比 ÷ 盈餘成長率（%，用' +
    '數字而非小數表示，例如成長率 15% 代入 15），把「股價貴不貴」跟「公司成長多快」放在' +
    '同一個比較基準上。Lynch 的經驗法則是 PEG 等於 1 大致代表合理定價，明顯低於 1 代表' +
    '相對於成長性而言股價可能偏低，高於 1（尤其遠高於）則可能偏貴。這是一個經驗法則，' +
    '不是嚴謹的學術估值模型，對高度週期性或成長率本身不穩定的公司參考價值有限。',
  token: 'TTM',
  threshold: { description: '< 1', thresholdLatex: '\\mathrm{PEG} < 1', note: 'Lynch 的經驗法則：PEG ≈ 1 大致代表合理定價，明顯低於 1 代表相對成長性而言股價偏低', denominator: 1, comparator: 'lt', value: 1 },
};
