import type { MetricBadge } from '@/domainPitMetrics/metricDefinitionSpec';

// Mebane Faber《Shareholder Yield: A Better Approach to Dividend Investing》(2013)。
// Faber 原始定義是股利殖利率+淨買回殖利率+淨還債殖利率三項，這裡只做前兩項（沒有還債
// 資料源），跟 AAII 的簡化篩選器做法一致。Faber 本人用的是「全市場排名前十分位」，不是
// 固定百分比門檻，這裡用業界常見的簡化門檻 5%，note 裡誠實說明不是原始論文的精確數字。
export const shareholderYieldBadge: MetricBadge = {
  name: '股東總回饋率',
  nameEn: 'Shareholder Yield',
  author: 'Mebane Faber, 2013',
  summary: '股利殖利率加上買回殖利率達到 5% 以上，代表公司透過股利+回購對股東的總回饋豐厚。',
  detail:
    'Mebane Faber 在《Shareholder Yield: A Better Approach to Dividend Investing》一書' +
    '指出，只看股利殖利率會低估一家公司對股東的實際回饋——許多公司選擇用買回庫藏股取代' +
    '配息回饋股東（買回不必負擔股利稅、更有彈性），Faber 提出「股東總回饋率 = 股利殖利率 ' +
    '+ 買回殖利率（+淨還債殖利率）」，這裡只做前兩項，沒有涵蓋原始定義的還債項目。Faber ' +
    '本人的篩選方法是在全市場排名取最高十分位，不是設定固定百分比門檻，這裡改用業界常見的' +
    '簡化門檻，不是原始論文的精確數字。',
  timeframe: 'TTM',
  threshold: { description: '≥ 5%', thresholdLatex: '\\mathrm{ShareholderYield} \\geq 5', note: '業界常見簡化門檻，Faber 原始方法是全市場排名前十分位，不是固定百分比', denominator: 1, comparator: 'gte', value: 5 },
};
