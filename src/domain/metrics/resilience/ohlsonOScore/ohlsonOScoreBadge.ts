import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-20 這支徽章的門檻出處經歷過一次下架再掛回：
//
// 第一輪查核（e110a76a）下架，理由是 0.5 不是 Ohlson (1980) 論文本身選的切點——論文 Table 4
// 列了各切點的 Type I/II 錯誤率，在他的樣本（105 家破產 / 2,058 家正常）上讓兩類錯誤總和最小的
// 是 0.038，Begley, Ming & Watts (1996, Review of Accounting Studies) 重新檢驗時也逐字寫「A
// cut-off point of 0.038 is used in Ohlson's original model」。0.5（= O > 0）只是邏輯迴歸的數學
// 中點，維基/metricgate 等二手來源常把它誤寫成「Ohlson 的切點」。
//
// 使用者決定掛回，標準是：門檻不必是原始出處規定的數字，只要**有學術論文採用過這個門檻、設定方
// 不是本平台**即可。0.5（= O > 0）是邏輯迴歸模型的慣例切點，實證應用文獻普遍採用；台灣的例子如
// 廖彥傑《台灣公司治理地圖—從破產機率分析》（國立臺灣大學財務金融學系碩士論文，2023，指導教授
// 王衍智，DOI 10.6342/NTU202300759）第 9 頁文獻回顧逐字寫「任何大於 0.5 的結果都表明該公司將在
// 兩年內違約」——注意那篇論文的主題是公司治理與破產機率的關聯，0.5 只是它在文獻回顧裡沿用的慣例，
// **不是該論文的研究貢獻**，所以 author 維持 Ohlson，論文只在 note 當「採用實例」提，不當「門檻設定
// 者」。使用者 2026-09-20 明確糾正過「廖彥傑（門檻）」這種寫法：搞得好像人家論文專門在定義這個門檻。
//
// 為什麼不用 0.038：那是 Ohlson 樣本破產基底率（約 4.9%）下的最適點，換成台灣母體最適切點就會
// 跑掉；而且模型的 SIZE 變數用 GNP 物價指數平減到 1968 年美元，O 值本身跨幣別/年代就不可比，
// 「哪個切點最適」的問題在台灣資料上沒有乾淨的答案。0.5 至少是一個明確的、有台灣論文採用的、
// 對應「機率超過一半」這個直覺語意的線，detail 裡把這層限制說清楚。
export const ohlsonOScoreBadge: MetricBadge = {
  name: 'Ohlson O-Score',
  nameEn: 'Ohlson O-Score',
  author: 'James Ohlson, 1980',
  // 2026-09-20 sourceUrl 實際 fetch 驗證：英文維基逐字寫 For the O-score, any results larger than 0.5 suggest that the firm will default within two years，並有完整九變數公式。
  sourceUrl: 'https://en.wikipedia.org/wiki/Ohlson_O-score',
  summary: '用邏輯迴歸模型估計企業陷入財務困境的機率，低於 0.5 代表模型估計兩年內違約的機率不到一半。',
  detail:
    '紐約大學會計學教授 James Ohlson 於 1980 年發表，是財務危機預測領域除了 Altman Z-Score 外另一個常被' +
    '引用的模型。與 Z-Score 用加權加總的做法不同，O-Score 用邏輯迴歸（logistic regression）方式，將公司' +
    '規模、負債比、營運資金比率、流動比率、獲利能力、現金流量等 9 項財務因子代入模型，直接估計出一個' +
    '「陷入財務困境」的機率值。0.5（即 O 值大於 0）是邏輯迴歸模型的慣例判別線，實證應用文獻普遍採用，' +
    '台灣的研究（例如廖彥傑 2023 年台大財金所碩士論文對上市櫃公司的分析）也沿用；但它不是 Ohlson 原始' +
    '論文選的切點——原論文在其 1970 年代美國樣本上讓兩類錯誤總和最小的切點是 0.038，那個數字隨樣本的' +
    '破產基底率變動，搬到其他市場沒有乾淨的對應值。模型係數用 1970 年代美國公司資料校準，規模變數平減到 1968 年美元，' +
    '套用在台灣公司時機率值的絕對水準只能當參考，同一家公司跨期的相對變化比單一時點的數字更有意義。',
  timeframe: 'TTM',
  threshold: {
    description: '< 0.5',
    thresholdLatex: '\\mathrm{O} < 0.5',
    note: '邏輯迴歸模型的慣例切點（O 值大於 0），實證應用文獻普遍採用，台灣研究如廖彥傑（2023，台大財金所碩士論文）亦沿用；Ohlson 原始論文在其美國樣本上的最適切點是 0.038，不同市場的最適值不同',
    denominator: 1,
    comparator: 'lt',
    value: 0.5,
  },
};
