import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-22：Baolian Wang《The Cash Conversion Cycle Spread》（Journal of Financial Economics 133(2), 2019；
// sourceUrl 是 Ivey 商學院公開鏡像的全文 PDF，已下載逐字核對）。2026-09-20 第一輪曾下架舊的
// cashConversionCycleBadge（Michael Dell「< 0」），理由是 Dell 是商業案例不是門檻提出者、「< 0」是本站自訂——
// 這篇是真正的原創研究，且用十分位排序法，percentileRank 機制可以忠實還原。方法論逐字（PDF 第 12 頁）：
// 「We conduct the decile-sort test as follows: At the start of each month, beginning in July 1976 and ending
// in December 2015, we sort stocks into deciles based on CCC.」結果（第 3 頁）：「A zero-investment portfolio
// that buys stocks in the lowest CCC decile and shorts stocks in the highest CCC decile earns a monthly excess
// return of 0.500% for an EW portfolio and 0.402% for a VW portfolio.」（第 13 頁）「the stocks in the lowest
// CCC deciles outperform the stocks in the highest CCC deciles by 5 to 7% per year.」
// 樣本：NYSE/Amex/NASDAQ 普通股 1976/7–2015/12，排除金融業（第 7 頁）——本站 cashConversionCycle 對銀行
// 本來就算不出來（沒有存貨/應收），排名母體自然不含金融業。scope market：論文母體全市場不分產業，且第 13 頁
// 明講效應「跨產業、大型股也成立」。台灣本土複製：未找到免費全文（Chen, Choy & Tan 2022 JBF 47 國版本在付費牆），
// 這是這支徽章目前的弱點，文案不寫台灣。
export const cashConversionCycleBadge: MetricBadge = {
  name: '現金轉換循環最短十分位',
  nameEn: 'Cash Conversion Cycle Bottom Decile',
  author: 'Baolian Wang, 2019',
  sourceUrl: 'https://www.ivey.uwo.ca/media/3789366/the-cash-conversion-cycle-spread.pdf',
  summary: '現金轉換循環天數排在全市場最短的十分之一（最低 10%），對照 Wang (2019) 論文十分位排序法中報酬表現最好的一組。',
  detail:
    'Baolian Wang 在 2019 年《Journal of Financial Economics》發表的研究把美國上市公司依現金轉換循環（存貨天數＋' +
    '應收天數－應付天數）由短到長切成十等分，發現最短的一組後續報酬每年高於最長的一組約 5 到 7 個百分點，' +
    '而且這個差距在不同產業、大型股樣本裡都存在，無法用既有的風險因子解釋。這是排名，不是絕對天數門檻，' +
    '照論文的十分位定義排；天數為負（靠供應商信用週轉）的公司會排在最前面，這跟論文一致。',
  timeframe: 'TTM',
  threshold: {
    description: '最短 10%',
    thresholdLatex: '\\mathrm{CCC\\ Percentile} \\geq 90',
    note: 'Wang (2019) 用全市場十等分（decile）排序法，最短現金轉換循環那組即最低 10%，不是絕對天數門檻。direction 用 asc（天數越少排名越前面）。論文排除金融業，本站對銀行本來就不計算此指標。',
    denominator: 1,
    percentileRank: { scope: 'market', direction: 'asc', topPercent: 10 },
  },
};
