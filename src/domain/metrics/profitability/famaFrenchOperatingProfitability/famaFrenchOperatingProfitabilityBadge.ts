import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-21：Eugene Fama & Kenneth French 五因子模型（2015，JFE；付費牆 DOI 見
// famaFrenchOperatingProfitabilityDefinition.ts 的 academicSourceUrl）的 RMW（Robust Minus Weak）
// 因子——「Robust」組定義為營業獲利力（OP）在 NYSE 第 70 百分位以上，也就是前 30%。已直接讀
// Kenneth French 本人維護的 Data Library 頁面（sourceUrl，「6 Portfolios Formed on Size and
// Operating Profitability」）逐字確認：「OP for June of year t is annual revenues minus cost of
// goods sold, interest expense, and selling, general, and administrative expenses divided by book
// equity for the last fiscal year end in t-1. The OP breakpoints are the 30th and 70th NYSE
// percentiles.」——這是排名法不是絕對數字，用 threshold.percentileRank 忠實還原。
//
// 跟原文的已知差異（跟 novyMarxGpToAssetsBadge 同一種簡化）：原文用年度數字、六月底重組一次、
// NYSE 母體算 breakpoints；本站用 TTM 分子/本季期末權益、台股全市場排名。scope 選 market——
// 原文排名母體是全市場不分產業。
export const famaFrenchOperatingProfitabilityBadge: MetricBadge = {
  name: '營業獲利力前 30%',
  nameEn: 'Fama-French Robust Operating Profitability',
  author: 'Eugene F. Fama & Kenneth R. French, 2015',
  sourceUrl: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/six_portfolios_me_op.html',
  summary: 'Fama-French 營業獲利力（營收−銷貨成本−推銷管理費用−利息 / 帳面權益）排在全市場前 30%，對照五因子模型 RMW 因子的「Robust」組定義。',
  detail:
    'Fama 與 French 在 2015 年把三因子模型擴充成五因子，新增的 RMW（Robust Minus Weak）因子' +
    '用「營業獲利力」區分公司：營收扣掉銷貨成本、推銷管理費用與利息費用後，除以帳面權益。' +
    '他們的做法是以全市場第 30 與第 70 百分位為分界切成三組，最高的一組（前 30%）稱為' +
    '「Robust」，長期報酬與最低的一組有系統性差距。這是排名，不是一個絕對數字門檻，本站' +
    '照他們的分界定義排，不自己訂常數。',
  timeframe: 'TTM',
  threshold: {
    description: '前 30%',
    thresholdLatex: '\\mathrm{OP\\ Percentile} \\geq 70',
    note: 'Fama & French 五因子模型的 OP breakpoints 是 NYSE 第 30/70 百分位，「Robust」組即第 70 百分位以上（前 30%），不是絕對數字門檻。',
    denominator: 1,
    percentileRank: { scope: 'market', direction: 'desc', topPercent: 30 },
  },
};
