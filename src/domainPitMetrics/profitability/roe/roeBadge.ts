import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// Robert Hagstrom《The Warren Buffett Way》(1994) 引用巴菲特 1987 年 Berkshire 致股東信的
// "two tests of economic excellence"：10年均值 ROE > 20%、且單一年度 ROE 不低於 15%。這裡
// 只實作單期不低於 15% 這一半（沒有 10 年序列可驗證均值），跟 AAII 的 Buffett-Hagstrom
// 篩選器做法一致（近四季 ROE > 15%）。
export const roeBadge: MetricBadge = {
  name: '巴菲特 ROE 門檻',
  nameEn: 'Buffett ROE Threshold',
  author: 'Warren Buffett, 1987; Robert Hagstrom, 1994',
  summary: '近四季股東權益報酬率達到 15% 以上，符合巴菲特對「經濟優異」企業的其中一項標準。',
  detail:
    '巴菲特在 1987 年 Berkshire Hathaway 致股東信中提出兩項「經濟優異」測試：10 年 ROE 均值' +
    '超過 20%，且任一年度不低於 15%。Robert Hagstrom 在《The Warren Buffett Way》中把這套標準' +
    '整理成篩選規則，AAII 的 Buffett-Hagstrom 篩選策略也採用「近四季 ROE > 15%」作為簡化版' +
    '判準。這裡只實作單期不低於 15% 這一半（沒有 10 年序列可驗證均值條件），是完整原始規則的' +
    '簡化版，不是全貌。',
  timeframe: 'TTM',
  threshold: { description: '≥ 15%', thresholdLatex: '\\mathrm{ROE} \\geq 15', note: '巴菲特 1987 年致股東信 "single year ROE" 門檻，非 10 年均值 20% 那一半條件', denominator: 1, comparator: 'gte', value: 15 },
};
