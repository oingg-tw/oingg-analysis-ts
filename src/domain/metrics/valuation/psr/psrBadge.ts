import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// Kenneth Fisher《Super Stocks》(1984) 提出的量化篩選框架：股價營收比（PSR）< 0.75 倍是
// 「超級股票」的訊號之一（書中原始框架：PSR > 1.5 倍直接避開，PSR 落在 3-6 倍之間考慮
// 出場）。Fisher 認為營收比淨利穩定，用 PSR 篩選比 P/E 更能避開景氣循環股在獲利低谷期
// 被誤判成便宜股的問題。
export const psrBadge: MetricBadge = {
  name: 'Fisher 超級股票',
  nameEn: "Fisher's Super Stocks",
  author: 'Kenneth Fisher, 1984',
  summary: '股價營收比低於 0.75 倍，符合 Fisher《Super Stocks》定義的超級股票篩選門檻。',
  detail:
    'Kenneth Fisher 在《Super Stocks》(1984) 提出用股價營收比（PSR）取代本益比篩選價值股——' +
    '營收比淨利穩定，不會因為公司處在獲利循環低谷（甚至虧損）就讓本益比失去意義或算不出來。' +
    'Fisher 原始框架：PSR 低於 0.75 倍是他定義的「超級股票」訊號，高於 1.5 倍直接避開，' +
    '重新評價到 3-6 倍區間時應該考慮出場。',
  timeframe: 'TTM',
  threshold: { description: '< 0.75 倍', thresholdLatex: '\\mathrm{PSR} < 0.75', note: 'Fisher 原始框架的「超級股票」門檻，同一框架另有 >1.5 倍避開、3-6 倍考慮出場的門檻，這裡只掛核心的買進門檻', denominator: 1, comparator: 'lt', value: 0.75 },
};
