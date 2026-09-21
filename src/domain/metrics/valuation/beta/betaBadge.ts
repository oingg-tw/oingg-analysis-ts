import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-22：Malcolm Baker, Brendan Bradley & Jeffrey Wurgler《Benchmarks as Limits to Arbitrage: Understanding
// the Low-Volatility Anomaly》（Financial Analysts Journal 67(1), 2011）。sourceUrl 是 Wurgler 在 NYU Stern 個人頁
// 公開的全文 PDF，已下載逐字核對。方法論（Figure 1 註，第 3 頁）：「For each month, we sorted all publicly traded
// stocks (Panels A and C) and the top 1,000 stocks by market capitalization (Panels B and D) tracked by CRSP (with
// at least 24 months of return history) into five equal quintiles according to trailing volatility (standard
// deviation) and beta. … We estimated volatility and beta by using up to 60 months of trailing returns」。結果
// （Table 1 Panel B「Beta sorts」，1968/1–2008/12）：最低 beta 五分位 Sharpe 0.42、幾何平均超額報酬 4.42%，最高
// 五分位 Sharpe 0.05、−2.42%（全市場）；前 1,000 大 0.46 vs 0.06。
// 為什麼掛 BBW 不掛 Frazzini & Pedersen (2014)：FP 的 beta 是「1 年日資料估波動 × 5 年 3 日重疊報酬估相關」再向 1
// 收縮，本站沒有等價窗口；BBW 用 60 個月月報酬跑迴歸，跟本站 beta 的 5Y×1M 窗口（對齊 Morningstar 5 年月頻）完全
// 對得上，所以 timeframe 固定 5Y_1M，不用新算變體。FP 也證實同方向（低 beta 組 alpha 高，美國十分位 alpha 單調遞減）。
// 台灣本土證據（2026-09-22 查證時）是混合的：杜宣霈（2020，交大碩論）摘要稱台股存在低 beta 異象；PBFJ 2025 一篇台灣
// 論文發現 beta 與報酬「隔夜正、日內負」；亞洲 BAB 複製（2022）不含台灣。使用者知情後拍板做，文案不寫台灣。
export const betaBadge: MetricBadge = {
  name: 'Beta 最低五分位',
  nameEn: 'Low-Beta Bottom Quintile',
  author: 'Malcolm Baker, Brendan Bradley & Jeffrey Wurgler, 2011',
  sourceUrl: 'https://pages.stern.nyu.edu/~jwurgler/papers/faj-benchmarks.pdf',
  summary: '五年月頻 Beta 排在全市場最低的五分之一（最低 20%），對照 Baker、Bradley 與 Wurgler（2011）論文五分位排序法中風險調整後報酬最高的一組。',
  detail:
    'Baker、Bradley 與 Wurgler 在 2011 年《Financial Analysts Journal》發表的研究把美國上市公司依過去 60 個月的 Beta' +
    '切成五等分，1968 到 2008 年間最低 Beta 的一組 Sharpe 比率 0.42、年化超額報酬 4.42%，最高的一組只有 0.05 與 −2.42%' +
    '——跟 CAPM「風險越高報酬越高」的預期相反，這就是所謂的低波動／低 Beta 異象。作者把原因歸於基金經理人被基準' +
    '指數綁住、不願意持有低 Beta 股票。這是排名，不是絕對數字門檻，本站直接沿用論文的五分位定義，Beta 用跟論文' +
    '同樣的五年月頻窗口計算。Beta 低只代表跟大盤連動小，不代表個別公司風險低。',
  timeframe: '5Y_1M',
  threshold: {
    description: '最低 20%',
    thresholdLatex: '\\mathrm{Beta_{5Y,1M}\\ Percentile} \\geq 80',
    note: 'Baker, Bradley & Wurgler (2011) 用全市場五等分（quintile）排序、beta 以最多 60 個月的月報酬估計，最低一組即最低 20%。direction 用 asc（Beta 越小排名越前面）；排名母體只含當日有 5Y_1M 值的公司（2026-09 約 960 家，beta 逐日回填尚未涵蓋全市場）。',
    denominator: 1,
    percentileRank: { scope: 'market', direction: 'asc', topPercent: 20 },
  },
};
