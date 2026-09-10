import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const ncavDefinition: MetricDefinitionSpec = {
  metricCode: 'ncav',
  displayName: '淨流動資產價值 (NCAV)',
  unit: '元',
  formulaNote: '= (本季期末流動資產 − 總負債 − 特別股股本)/流通股數。純資產負債表時點快照，只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{NCAV} = \\frac{\\mathrm{CurrentAssets} - \\mathrm{TotalLiabilities} - \\mathrm{PreferredStock}}{\\mathrm{Shares}}',
  // 出處是葛拉漢與陶德《Security Analysis》(1934)，不是期刊論文——archive.org 上這個
  // 掃描本完全公開免費，不需要借閱帳號。
  academicSourceUrl: 'https://archive.org/details/dli.ernet.7983',
  referenceUrl: 'https://en.wikipedia.org/wiki/Net_current_asset_value',
  tier: 'composite',
  badge: {
    id: 'ncav',
    name: 'NCAV（淨流動資產價值）',
    nameEn: 'Net Current Asset Value',
    author: 'Benjamin Graham',
    summary: '用「流動資產減總負債」估算的清算價值角度估值方法，又稱 Net-Net。',
    detail:
      'Benjamin Graham 提出的另一個保守估值角度，計算方式為流動資產減去全部負債（不含流動資產以外的其他' +
      '資產，如廠房設備），概念上接近「假設公司立刻清算，扣掉全部負債後，流動資產部分大約還剩多少」。當股價' +
      '低於每股 NCAV 時，傳統上被視為股價相對於這個保守清算價值角度而言偏低，因此又被稱為 Net-Net 選股法。' +
      '這是一個特定角度的估值參考方法，不考慮公司未來獲利能力或成長性。',
    token: 'Q',
    threshold: { description: '股價 < NCAV', denominator: 1, comparator: 'lt', compareAgainstFieldId: 'stockPrice.Q' },
  },
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['current_assets', 'liabilities', 'paidInShares'],
  currentFormulaVersion: 1,
};
