import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

  // 第六批遷移（第三層：guru 分類 9 支重型多因子模型）：範圍刻意限縮成只遷移「最終分數/
  // 輸出」，不拆分內部子變量成獨立 metric_code（Piotroski 的 9 訊號、Beneish 的 8 變量、
  // Ohlson 的 9 變量、Altman 的 X1-X5、Nissim-Penman 的 FLEV/NBC/SPREAD 都是模型內部
  // 機制，不是一般會單獨查詢比較的財務比率）。grahamNumber/altmanZScore/
  // nissimPenmanRnoa 獨立重新實作，不依賴 eps/bvps/interestCoverage/assetTurnover/roe
  // 這些已遷移 metric_code。piotroskiFScore/beneishMScore/ohlsonOScore 第一次用到 YoY
  // 比較——沒有專門的「去年同季」查詢函式，重用既有 getPastNQuarters({rocYear,season},5)[0]
  // 拿去年同季的 year/season，不是新機制。
export const grahamNumberDefinition: MetricDefinitionSpec = {
  metricCode: 'grahamNumber',
  displayName: '葛拉漢數字',
  unit: '元',
  formulaNote:
    '= sqrt(22.5 x EPS(TTM) x BVPS)，EPS(TTM)/BVPS 須為正才有意義。獨立重新計算 EPS(TTM)/' +
    'BVPS（不依賴 eps/bvps 這兩個 metric_code 已寫入的值）。只有 TTM 一種 basis——因為' +
    'EPS(TTM) 是否齊全決定整個公式算不算得出來。',
  formulaLatex: '\\mathrm{GrahamNumber} = \\sqrt{22.5 \\times \\mathrm{EPS}_{\\mathrm{TTM}} \\times \\mathrm{BVPS}}',
  // 出處是葛拉漢《The Intelligent Investor》(1949)，不是期刊論文——archive.org 上該書
  // 掃描本需要借閱帳號（access-restricted），沒有完全公開的版本，仍是合法可查證的出處連結。
  academicSourceUrl: 'https://archive.org/details/intelligentinves00grah_1',
  referenceUrl: 'https://en.wikipedia.org/wiki/Graham_number',
  tier: 'composite',
  badge: {
    id: 'graham-number',
    name: 'Graham Number',
    nameEn: 'Graham Number',
    author: 'Benjamin Graham, 1949',
    summary: '用每股盈餘與每股淨值估算的一個保守估值上限參考值。',
    detail:
      '價值投資之父 Benjamin Graham 在其著作中提出的簡化估值公式，計算方式為「每股盈餘 × 每股淨值 × 22.5」' +
      '開根號。22.5 這個常數來自 Graham 自己設定的兩個上限：本益比不超過 15 倍、股價淨值比不超過 1.5 倍' +
      '（15 × 1.5 = 22.5）。這個數字原始用途是作為一個保守的估值參考上限，幫助篩選相對於獲利與帳面資產而言' +
      '股價偏低的公司，是 Graham 個人投資哲學下的簡化公式。',
    token: 'TTM',
    threshold: {
      description: '股價 < Graham Number（Graham 本人的比較慣例）',
      denominator: 1,
      comparator: 'lt',
      compareAgainstFieldId: 'stockPrice.Q',
    },
  },
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'equity_attributable_to_owners_of_parent', 'equity', 'paidInShares'],
  currentFormulaVersion: 1,
};
