import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-23：Narasimhan Jegadeesh & Joshua Livnat《Revenue Surprises and Stock Returns》，Journal of
// Accounting and Economics 41(1-2): 147–171（2006）。全文已下載逐字核對（NYU Stern 公開 PDF）。
//
// 定義（式 6，第 6 頁）：「we define standardized unexpected revenue growth estimate (SURGE) as
// SURGE_{i,t} = (REV_{i,t} − E(REV_{i,t})) / ξ_{i,t}, where REV_{i,t} is the quarterly revenue per share,
// and E(REV_{i,t}) is the expected quarterly revenue per share prior to earnings announcement, and ξ_{i,t}
// is the standard deviation of quarterly revenue growth. As with earnings, we also assume that REV also
// follows a seasonal random walk and we estimate its expectation and the standard deviation in a manner
// similar to that for quarterly EPS.」——EPS 那組（式 2~5）是漂移項取前 8 個季節差分的平均、σ 取同一組
// 的樣本標準差（除以 7），且要求至少前 12 期資料。
//
// **分組是五分位不是十分位**（這就是要讀原文的理由，SUE 那支用的 CJL 1996 是十分位）：「We assign each
// stock to one of five SURGE quintiles during each six-month period based on the quintile cutoffs from the
// SURGE distribution in the previous six-month period. We label these SURGE quintiles R1 through R5, where
// R1 is the smallest SURGE quintile and R5 is the largest SURGE quintile.」——最高一組 R5 即前 20%。
// 注意分界點取自**前一個六個月期間**的分布，是 point-in-time 的做法，沒有前視偏誤。
//
// 摘要的核心發現：「We find significant abnormal returns in the post announcement period for stocks that
// have large revenue surprises, **after controlling for earnings surprises**.」——這句話是 SUS 存在的
// 理由（跟既有的 sue 不是同一個訊號），也是這支徽章跟「未預期盈餘最高十分位」不重複的根據。
//
// 樣本：COMPUSTAT + CRSP，165,708 個公司-季，**排除金融業**（原文：「We exclude financials from the
// sample since the revenues of financial firms are …」）——所以金融業的 SUS 徽章在學理上沒有出處支撐，
// 這點寫進 threshold.note 讓下游知道。
//
// 台灣採用實例（放 note 當本土佐證，不當出處）：顧廣平（2010）「營收動能策略」，管理學報 27(3): 267-289，
// DOI 10.6504/JOM.2010.27.03.04——用每月公告之營收估計標準化未預期營收，買前 20% 賣後 20%，獲取 1~12 個月
// 顯著正的平均報酬，且在控制樣本期間、季節、交易所、產業、規模、週轉率、淨值市價比、過去報酬、未預期盈餘
// 與風險之後仍然存在；但同一篇也發現持有第 25~36 個月間存在顯著負的累積平均報酬（效果會反轉），這點一併寫進
// note，只引用前半句是選擇性引用。
// 不掛顧廣平當作者的理由：使用者不希望同一位學者掛太多支徽章（先前已因此拆過一輪），且本專案規則是
// author 只寫原始提出者、台灣論文放 note。
export const susBadge: MetricBadge = {
  name: '未預期營收最高五分位',
  nameEn: 'Revenue Surprise Top Quintile',
  author: 'Narasimhan Jegadeesh & Joshua Livnat, 2006',
  sourceUrl: 'https://pages.stern.nyu.edu/~jlivnat/JAE%20submission.pdf',
  summary: '標準化未預期營收（SUS）排在全市場最高的五分之一（前 20%），對照 Jegadeesh 與 Livnat（2006）論文五分位排序法中的營收意外最高組 R5。',
  detail:
    'Jegadeesh 與 Livnat 在 2006 年《Journal of Accounting and Economics》發表的研究，把公司依標準化未預期營收' +
    '（當期營收相對季節性預期的差距，除以過去八期這類差距的標準差）由低到高切成五等分，最高的一組稱為 R5。' +
    '他們發現營收意外大的公司在公告後仍有顯著的異常報酬，而且**這個效果在控制住盈餘意外之後依然存在**' +
    '——也就是說營收意外帶有盈餘意外沒有涵蓋的訊息，兩者不是同一個訊號。作者同時發現分析師雖然會因應營收意外' +
    '調整獲利預估，但調整得不夠充分。這是排名不是絕對數字門檻，照論文的五分位定義排；SUS 用跟論文同樣的' +
    '季節性隨機漫步模型計算，差別是論文用每股季營收、這裡用台灣特有的單月營收金額。',
  timeframe: 'M',
  threshold: {
    description: '前 20%',
    thresholdLatex: '\\mathrm{SUS\\ Percentile} \\geq 80',
    note:
      'Jegadeesh & Livnat (2006) 把股票依 SURGE 分成五個五分位組合、最高一組 R5 即前 20%，不是絕對數字門檻；' +
      '分界點取自前一個六個月期間的分布（point-in-time，沒有前視偏誤）。原文樣本**排除金融業**（金融業的營收' +
      '性質與一般產業不同），所以金融業的這面徽章沒有原文的學理支撐。' +
      '台灣採用實例：顧廣平（2010，管理學報 27(3): 267-289）以每月公告之營收估計標準化未預期營收，買前 20%、' +
      '賣後 20%，取得 1~12 個月顯著正的平均報酬，且在控制產業、規模、週轉率、淨值市價比、過去報酬、未預期盈餘' +
      '與風險之後仍然存在；同一篇也發現持有第 25~36 個月間出現顯著負的累積平均報酬，效果會隨時間反轉。',
    denominator: 1,
    percentileRank: { scope: 'market', direction: 'desc', topPercent: 20 },
  },
};
