import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-21：Eugene Fama & Kenneth French 五因子模型（2015）的 CMA（Conservative Minus
// Aggressive）因子——「投資」定義為總資產年增率，「Conservative」組是總資產成長在 NYSE 第 30
// 百分位以下，也就是最低 30%。已直接讀 Kenneth French 本人維護的 Data Library 頁面（sourceUrl，
// 「6 Portfolios Formed on Size and Investment」）逐字確認：「Investment is the change in total
// assets from the fiscal year ending in year t-2 to the fiscal year ending in t-1, divided by t-2
// total assets. The Inv breakpoints are the 30th and 70th NYSE percentiles.」
//
// 方向是反直覺的：Fama-French 跟更早的 Cooper/Gulen/Schill (2008，assetGrowthDefinition.ts 的
// academicSourceUrl) 都發現總資產擴張越快的公司，後續報酬傾向越差；擴張最保守的一組報酬反而
// 較好。所以這支徽章判定的是「總資產成長率排在全市場最低 30%」，direction 用 asc。文案要把
// 這件事講清楚，不然使用者會以為資產成長高才是好事。
//
// 跟原文的已知差異：原文用年度資產、六月底重組、NYSE 母體算 breakpoints；本站用本季 vs 去年
// 同季總資產、台股全市場排名。scope 選 market——原文排名母體是全市場不分產業。
export const assetGrowthBadge: MetricBadge = {
  name: '總資產擴張最保守 30%',
  nameEn: 'Fama-French Conservative Investment',
  author: 'Eugene F. Fama & Kenneth R. French, 2015',
  sourceUrl: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/six_portfolios_me_inv.html',
  summary: '總資產年增率排在全市場最低 30%，對照 Fama-French 五因子模型 CMA 因子的「Conservative」組定義——資產擴張越慢，歷史上後續報酬反而越好。',
  detail:
    'Fama 與 French 2015 年五因子模型的 CMA（Conservative Minus Aggressive）因子用「投資」' +
    '區分公司，投資定義為總資產年增率。他們以全市場第 30 與第 70 百分位為分界切成三組，總' +
    '資產成長最慢的一組（最低 30%）稱為「Conservative」。這個因子的方向跟直覺相反：資產擴張' +
    '最激進的公司，長期報酬系統性落後於擴張最保守的公司（Cooper、Gulen 與 Schill 2008 年' +
    '的研究更早發現同一現象）。這是排名，不是一個絕對數字門檻，本站直接沿用他們的分界定義，' +
    '不自己訂常數。',
  timeframe: 'Q',
  threshold: {
    description: '最低 30%',
    thresholdLatex: '\\mathrm{AssetGrowth\\ Percentile} \\geq 70',
    note: 'Fama & French 五因子模型的 Inv breakpoints 是 NYSE 第 30/70 百分位，「Conservative」組即第 30 百分位以下（最低 30%）；direction 用 asc（數值越小排名越前面）。',
    denominator: 1,
    percentileRank: { scope: 'market', direction: 'asc', topPercent: 30 },
  },
};
