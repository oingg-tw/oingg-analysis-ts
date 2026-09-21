import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-21：Robert Novy-Marx《The Other Side of Value: The Gross Profitability Premium》
// （Journal of Financial Economics, 2013；付費牆版本見 novyMarxGpToAssetsDefinition.ts 的
// academicSourceUrl）把公司依毛利資產比（GP/A）由低到高切成五等分（quintile），最高的一組
// （前 20%）定義為「高獲利能力」組。已直接讀他個人網站免費公開的論文全文（sourceUrl，第 10 頁
// 「2.2. Sorts on profitability」）逐字確認：「Portfolios are constructed using a quintile sort,
// based on New York Stock Exchange (NYSE) break points」，且樣本「excludes financial firms」。
// Novy-Marx 本人從未給過一個絕對數字門檻（例如「GP/A > 33%」），他的方法論就是五分位排名本身，
// 之前因為 MetricBadge 型別只支援絕對常數比較被排除（見 badgeRegistry.ts 稽核紀錄）。2026-09-21
// 新增 threshold.percentileRank 變體後可以忠實呈現這個排名法，不用再硬湊一個他沒說過的絕對數字。
//
// scope 選 market（全市場，不分證交所類股）——這是 Novy-Marx 論文本身的排名母體（NYSE 全市場，
// 不分產業排名），不是「同類股前 20%」。sector 排名是本站另外提供的比較維度，不是這支徽章的
// 出處要求，未來有符合「同類股排名」定義的出處（目前還沒找到）再用。
export const novyMarxGpToAssetsBadge: MetricBadge = {
  name: '毛利資產比五分位',
  nameEn: 'Gross Profitability Top Quintile',
  author: 'Robert Novy-Marx, 2013',
  sourceUrl: 'https://mysimon.rochester.edu/novy-marx/research/OSoV.pdf',
  summary: '毛利資產比（毛利/總資產）排在全市場最高的五分之一（前 20%），對照 Novy-Marx 論文定義的「高獲利能力」組。',
  detail:
    'Robert Novy-Marx 在 2013 年發表的研究發現，毛利資產比（Gross Profit/Assets）越高的公司，' +
    '長期股票報酬也傾向越好，效果跟傳統的價值因子（本益比、股價淨值比）互補而非重疊。他的方法' +
    '是把全市場公司依這個比率由低到高切成五等分，最高的一組稱為「高獲利能力」組——這是排名，' +
    '不是一個絕對數字門檻，本站直接沿用他的排名定義，不自己訂常數。金融業的資產負債表沒有' +
    '「毛利」這個概念，不會出現在排名裡。',
  timeframe: 'TTM',
  threshold: {
    description: '前 20%',
    thresholdLatex: '\\mathrm{GPToAssets\\ Percentile} \\geq 80',
    note: 'Novy-Marx 論文用全市場五等分（quintile）排名，最高一組即前 20%，不是絕對數字門檻。',
    denominator: 1,
    percentileRank: { scope: 'market', direction: 'desc', topPercent: 20 },
  },
};
