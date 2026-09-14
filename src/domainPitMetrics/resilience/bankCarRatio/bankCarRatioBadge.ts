import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// Basel III 資本監理框架最低法定門檻——BCBS 2010年12月發布的原始文本（BCBS 189），總資本
// 適足率（Total Capital Ratio）最低要求 8%，是 Basel I（1988）以來就存在、Basel III 延續
// 未變的底線要求，各國主管機關（含台灣金管會）實務上會再疊加資本保留緩衝等要求到更高，
// 這裡採用的是 Basel 框架本身的最低法定線，不是台灣金管會的實際監理標準。
export const bankCarRatioBadge: MetricBadge = {
  name: 'Basel III 資本適足率門檻',
  nameEn: 'Basel III Total Capital Ratio Minimum',
  author: 'Basel Committee on Banking Supervision, 2010',
  summary: '資本適足率達到 8% 以上，符合 Basel III 資本監理框架的最低法定要求。',
  detail:
    'Basel III 資本監理框架（BCBS 189，2010年12月發布）延續 Basel I 以來的最低資本適足率' +
    '要求：總資本（Tier 1 + Tier 2）對風險加權資產的比率至少 8%。這是全球銀行監理的底線' +
    '要求，各國主管機關（含台灣金管會）實務上會再疊加資本保留緩衝（2.5%）等要求到更高的' +
    '實際監理標準，這裡呈現的是 Basel 框架本身的最低法定線，不是任何特定國家的實際監理' +
    '門檻。僅銀行/金融控股公司適用，其餘產業無此欄位資料。',
  timeframe: 'Q',
  threshold: { description: '≥ 8%', thresholdLatex: '\\mathrm{CAR} \\geq 8', note: 'Basel III 框架本身的最低法定線，非台灣金管會實際監理標準（各國會疊加緩衝要求）', denominator: 1, comparator: 'gte', value: 8 },
};
