import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

export const bankTier1RatioBadge: MetricBadge = {
  name: 'Basel III 第一類資本門檻',
  nameEn: 'Basel III Tier 1 Capital Minimum',
  author: 'Basel Committee on Banking Supervision, 2010',
  summary: '第一類資本比率達到 6% 以上，符合 Basel III 資本監理框架的最低法定要求。',
  detail:
    'Basel III 資本監理框架（BCBS 189）將第一類資本（Tier 1，含 CET1 與其他第一類資本）' +
    '對風險加權資產的最低要求，從 Basel II 的 4% 提高到 6%——涵蓋範圍介於最嚴格的 CET1' +
    '與較寬鬆的總資本要求之間。同樣是框架本身的最低法定線，各國主管機關實務監理標準' +
    '通常更高。僅銀行/金融控股公司適用。',
  timeframe: 'Q',
  threshold: { description: '≥ 6%', thresholdLatex: '\\mathrm{Tier1} \\geq 6', note: 'Basel III 框架本身的最低法定線，Basel II 時代原為 4%', denominator: 1, comparator: 'gte', value: 6 },
};
