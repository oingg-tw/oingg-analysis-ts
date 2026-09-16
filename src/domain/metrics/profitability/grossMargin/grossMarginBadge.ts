import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// Mary Buffett & David Clark《Warren Buffett and the Interpretation of Financial Statements》
// (2008)：毛利率持續 ≥40% 是耐久競爭優勢（護城河）訊號，書中舉可口可樂 60%、Moody's 73% 為例；
// <40% 代表競爭正在侵蝕獲利，<20% 代表沒有真正的優勢。
export const grossMarginBadge: MetricBadge = {
  name: '護城河毛利率',
  nameEn: 'Durable Moat Gross Margin',
  author: 'Mary Buffett, David Clark, 2008',
  summary: '毛利率達到 40% 以上，符合書中耐久競爭優勢（護城河）企業的毛利率特徵。',
  detail:
    'Mary Buffett 與 David Clark 合著《Warren Buffett and the Interpretation of Financial ' +
    "Statements》指出，擁有耐久競爭優勢的企業毛利率通常持續維持在 40% 以上（書中舉可口可樂" +
    "約 60%、Moody's 約 73% 為例）；毛利率低於 40% 代表競爭正在侵蝕獲利空間，低於 20% 則" +
    '代表這個產業裡沒有企業擁有真正的競爭優勢。',
  timeframe: 'TTM',
  threshold: { description: '≥ 40%', thresholdLatex: '\\mathrm{GrossMargin} \\geq 40', denominator: 1, comparator: 'gte', value: 40 },
};
