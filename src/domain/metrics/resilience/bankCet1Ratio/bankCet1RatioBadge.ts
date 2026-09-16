import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

export const bankCet1RatioBadge: MetricBadge = {
  name: 'Basel III CET1 資本門檻',
  nameEn: 'Basel III CET1 Minimum',
  author: 'Basel Committee on Banking Supervision, 2010',
  summary: '普通股權益比率（CET1）達到 4.5% 以上，符合 Basel III 資本監理框架的最低法定要求。',
  detail:
    'Basel III 資本監理框架（BCBS 189）新增「普通股權益第一類資本」（CET1）這個更嚴格的' +
    '資本分類，最低要求為對風險加權資產的 4.5%——CET1 只計入最高品質、最能實際吸收損失' +
    '的資本（主要是普通股與保留盈餘），比涵蓋範圍較寬的 Tier 1／總資本要求更嚴格。同樣' +
    '僅為框架本身的最低法定線，各國主管機關實務監理標準通常更高。僅銀行/金融控股公司' +
    '適用。',
  timeframe: 'Q',
  threshold: { description: '≥ 4.5%', thresholdLatex: '\\mathrm{CET1} \\geq 4.5', note: 'Basel III 框架本身的最低法定線', denominator: 1, comparator: 'gte', value: 4.5 },
};
