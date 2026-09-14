import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// 同一本書：淨利率持續 ≥20% 是耐久競爭優勢訊號，書中舉可口可樂平均 21%、西南航空 7% 對照；
// 持續 <10% 代表處在沒有企業擁有優勢的高度競爭產業。
export const netProfitMarginBadge: MetricBadge = {
  name: '護城河淨利率',
  nameEn: 'Durable Moat Net Margin',
  author: 'Mary Buffett, David Clark, 2008',
  summary: '稅後淨利率達到 20% 以上，符合書中耐久競爭優勢企業的獲利轉換能力特徵。',
  detail:
    '同一本《Warren Buffett and the Interpretation of Financial Statements》指出，擁有耐久' +
    '競爭優勢的企業能把 20% 以上的營收轉換成稅後淨利（書中舉可口可樂平均約 21% 為例）；持續' +
    '低於 10% 的淨利率代表企業身處沒有任何一家擁有真正優勢的高度競爭產業（書中以西南航空約' +
    '7% 對照）。',
  timeframe: 'TTM',
  threshold: { description: '≥ 20%', thresholdLatex: '\\mathrm{NetProfitMargin} \\geq 20', denominator: 1, comparator: 'gte', value: 20 },
};
