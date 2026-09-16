import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// Brad Feld（創投家）提出，SaaS/軟體業界廣泛採用的複合成長效率指標。
export const ruleOf40Badge: MetricBadge = {
  name: 'Rule of 40',
  nameEn: 'Rule of 40',
  author: 'Brad Feld',
  summary: '營收成長率加上自由現金流利潤率達到 40% 以上，代表成長跟獲利效率取得平衡。',
  detail:
    'Brad Feld 提出、後來被創投與私募股權圈廣泛採用的軟體/SaaS 公司健康度指標：營收成長率' +
    '（%）加上自由現金流利潤率（%）的總和至少要達到 40%。這個指標的用意是同時看「成長速度」' +
    '跟「獲利效率」兩個常常互相拉扯的面向——一家公司可以用燒錢換取高成長，也可以犧牲成長換取' +
    '高利潤，Rule of 40 用一個總和數字檢驗這兩者有沒有取得合理平衡，只追求其中一項而放棄另一' +
    '項的公司通常不合格。這個指標是為輕資產、高毛利、經常性收入的軟體商業模式設計的，只套用' +
    '在資訊服務業/數位雲端這兩個類股，對其他產業沒有意義。',
  timeframe: 'TTM',
  threshold: { description: '≥ 40', thresholdLatex: '\\mathrm{RuleOf40} \\geq 40', note: '營收成長率(TTM)+FCF利潤率(TTM)的總和，只適用軟體/SaaS 商業模式', denominator: 1, comparator: 'gte', value: 40 },
};
