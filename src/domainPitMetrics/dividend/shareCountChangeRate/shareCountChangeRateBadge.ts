import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// Charlie Munger 提出「cannibal」（食人族）這個說法形容持續大量買回並註銷自家股票的公司——
// 流通股數持續縮減，讓每股能分到的獲利/資產份額越變越大，是股東導向資本配置的訊號之一。
export const shareCountChangeRateBadge: MetricBadge = {
  name: '股本食人族',
  nameEn: 'Compounding Cannibal',
  author: 'Charlie Munger',
  summary: '流通股數較去年同期減少，公司持續買回並註銷自家股票，讓每股權益/獲利份額變大。',
  detail:
    'Charlie Munger 用「cannibal」（食人族）形容那些持續大量買回並註銷自家股票的公司——股數' +
    '越變越少，代表公司把多餘的現金持續拿去買回自己被低估的股票，而不是稀釋股東權益的現金' +
    '增資或可轉債轉換。流通股數縮減本身不會創造新價值，但會讓每一股能分到的獲利/淨資產' +
    '份額變大，是股東導向資本配置紀律的訊號之一，尤其在公司同時維持穩定獲利成長時更有意義。',
  timeframe: 'Q',
  threshold: { description: '< 0%', thresholdLatex: '\\mathrm{ShareCountChangeRate} < 0', note: '股本較去年同期縮減，代表淨買回大於任何稀釋（現金增資、可轉債轉換等）', denominator: 1, comparator: 'lt', value: 0 },
};
