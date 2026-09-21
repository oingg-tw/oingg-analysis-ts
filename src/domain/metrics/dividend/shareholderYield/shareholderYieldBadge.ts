import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-21：Mebane Faber《Shareholder Yield: A Better Approach to Dividend Investing》（2013）。
// 2026-09-20 第一輪曾經下架這支徽章，因為「5% 門檻不是 Faber 的方法，Faber 原始做法是全市場
// 排名前十分位」——已直接讀他個人網站免費公開的論文全文重新查證，發現這個「十分位」的說法本身
// 就不準確：Faber 自己的回測方法論（Figure 13/17/18，「Portfolios divided into quartiles...
// Quartiles divide the universe into four buckets where 25% of the universe... fall into each
// bucket」）用的是「四分位」（quartile，前 25%），不是十分位。書裡提到的「top decile」（見 Chapter
// 4：「O'Shaughnessy finds that returns for the top decile of shareholder yield stocks were
// positive for every decade」）是 Faber 引用 O'Shaughnessy《What Works on Wall Street》的另一組
// 獨立回測結果，不是 Faber 本人的方法論——先前的下架紀錄把這兩件事混為一談。
//
// 現在用 threshold.percentileRank 可以忠實還原 Faber 本人的方法（四分位、前 25%），不用再
// 硬湊一個他沒說過的絕對百分比數字，也不用把別人的方法論冠在他名下。
//
// scope 選 market——Faber 的回測母體是 S&P 500 全市場（不分產業）排名，不是「同類股前 25%」。
export const shareholderYieldBadge: MetricBadge = {
  name: '股東總回饋率前四分位',
  nameEn: 'Shareholder Yield Top Quartile',
  author: 'Mebane T. Faber, 2013',
  sourceUrl: 'https://mebfaber.com/wp-content/uploads/2023/05/Shareholder-Yield.pdf',
  summary: '股東總回饋率（股利+買回庫藏股/市值）排在全市場最高的四分之一（前 25%），對照 Mebane Faber 論文的四分位回測方法。',
  detail:
    'Mebane Faber 在 2013 年發表的研究主張，只看股利殖利率會漏掉公司透過買回庫藏股回饋股東的' +
    '部分，把股利跟淨買回庫藏股加總成「股東總回饋率」才是完整的圖像。他的回測方法是把全市場公司' +
    '依這個比率由低到高切成四等分，最高的一組（前 25%）長期報酬比單純看股利殖利率的策略更高。' +
    '這是排名，不是一個絕對數字門檻，本站直接沿用他的排名定義，不自己訂常數。',
  timeframe: 'TTM',
  threshold: {
    description: '前 25%',
    thresholdLatex: '\\mathrm{ShareholderYield\\ Percentile} \\geq 75',
    note: 'Faber 論文用全市場四等分（quartile）排名，最高一組即前 25%，不是絕對數字門檻。',
    denominator: 1,
    percentileRank: { scope: 'market', direction: 'desc', topPercent: 25 },
  },
};
