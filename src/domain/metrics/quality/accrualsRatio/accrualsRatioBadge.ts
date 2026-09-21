import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-21：Richard G. Sloan《Do Stock Prices Fully Reflect Information in Accruals and Cash
// Flows about Future Earnings?》（The Accounting Review, 1996；付費牆版本見
// accrualsRatioDefinition.ts 的 academicSourceUrl）。2026-09-20 第一輪曾經下架這支徽章，因為
// 「±10% 門檻不是 Sloan 論文的數字，Sloan 原始論文用十分位排序法」——已直接讀論文全文（sourceUrl，
// Table 1「Mean (median) Values of Selected Characteristics for Ten Portfolios of Firms Formed
// Annually by Assigning Firms to Deciles Based on the Magnitude of Accruals」）逐字確認十分位
// 排序法屬實，且方向明確：H2(ii)「A trading strategy taking a long position in the stock of firms
// reporting relatively low levels of accruals and a short position in the stock of firms
// reporting relatively high levels of accruals generates positive abnormal stock returns」——
// 應計項目越低（現金流品質越高）排名越前面。
//
// 現在用 threshold.percentileRank 可以忠實呈現這個十分位排序法，不用再硬湊一個他沒說過的
// 絕對百分比數字。scope 選 market——論文原文排名母體是全市場（NYSE/AMEX）不分產業。
export const accrualsRatioBadge: MetricBadge = {
  name: '應計項目比率最低十分位',
  nameEn: 'Accruals Ratio Bottom Decile',
  author: 'Richard G. Sloan, 1996',
  sourceUrl: 'https://www.cuhk.edu.hk/acy2/workshop/June2009Wasley/1996TAR).pdf',
  summary: '應計項目比率排在全市場最低的十分之一（最低 10%），對照 Sloan (1996) 論文十分位排序法中報酬表現最好的一組。',
  detail:
    'Richard Sloan 在 1996 年發表的研究發現，淨利中「應計項目」（跟現金流脫節的那部分）占比' +
    '越高的公司，未來股票報酬傾向越差；占比越低（代表淨利品質越接近實際現金流）的公司，未來' +
    '報酬傾向越好。他的方法是把全市場公司依應計項目比率由低到高切成十等分，最低的一組長期' +
    '報酬顯著高於最高的一組。這是排名，不是一個絕對數字門檻，本站直接沿用他的排名定義，' +
    '不自己訂常數。',
  timeframe: 'TTM',
  threshold: {
    description: '最低 10%',
    thresholdLatex: '\\mathrm{AccrualsRatio\\ Percentile} \\geq 90',
    note: 'Sloan (1996) 論文用全市場十等分（decile）排序法，最低應計項目那組即最低 10%，不是絕對數字門檻。direction 用 asc（數值越小排名越前面）。',
    denominator: 1,
    percentileRank: { scope: 'market', direction: 'asc', topPercent: 10 },
  },
};
