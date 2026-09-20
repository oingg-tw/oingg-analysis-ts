import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

export const tobinsQBadge: MetricBadge = {
  name: '托賓Q值',
  nameEn: "Tobin's Q",
  author: 'James Tobin, 1969',
  // 2026-09-20 sourceUrl 實際 fetch 驗證：有完整公式，並逐字說明 When Tobin's q is less than 1, the market value is less than the book value of the company's assets。
  sourceUrl: 'https://en.wikipedia.org/wiki/Tobin%27s_q',
  summary: '市值低於資產重置成本，市場對企業資產的評價可能偏低。',
  detail:
    "James Tobin 提出的投資理論：Q = (市值 + 總負債) / 總資產，衡量市場對企業資產的評價相對於" +
    "重新取得這些資產所需成本的比值。Q < 1 代表市場對這家公司資產的評價低於帳面重置成本——" +
    "理論上，重新打造一家一樣的公司比直接在市場上買下它的股票更貴，這種價差傳統上被視為潛在" +
    "併購目標或市場低估的訊號；Q > 1 則代表市場評價高於重置成本，可能反映品牌/專利等未入帳的" +
    "無形資產，或市場對未來成長機會的溢價。這是 1969 年提出的總體投資理論延伸到個股層次的" +
    "應用，不是嚴格的估值公式，也不考慮產業間資產密集度的差異（重資產產業的 Q 值天生偏低）。",
  timeframe: 'Q',
  threshold: { description: '< 1', thresholdLatex: '\\mathrm{TobinsQ} < 1', note: 'Tobin (1969) 投資理論延伸到個股層次的低估訊號，非嚴格估值公式', denominator: 1, comparator: 'lt', value: 1 },
};
