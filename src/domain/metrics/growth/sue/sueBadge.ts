import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-22：Louis K. C. Chan, Narasimhan Jegadeesh & Josef Lakonishok《Momentum Strategies》，Journal of
// Finance 51(5): 1681–1713（1996）。sourceUrl 是 NBER Working Paper 5375（1995，https 免費公開；期刊版全文只有
// Wharton 課程頁的 http 鏡像，被 badgeSourceUrl 測試的 https 規則擋掉）——兩個版本都已下載核對，WP 第 4–5、10 頁
// 與期刊版第 1684–1685、1691 頁的定義、十分位、6.8%/7.5% 逐字相同（WP 是掃描影像，用 pymupdf 轉圖逐頁讀）。
// 方法論（期刊版第 1684–1685 頁）：「The ranked stocks are then assigned to one of ten decile portfolios, where the
// breakpoints are based only on NYSE stocks. … Our first is the commonly used standardized unexpected earnings
// (SUE) variable. … They find that a seasonal random walk model performs as well as more complex models, so we
// use it as our model of expected earnings. The SUE for stock i in month t is thus defined as (e_iq − e_iq−4) / σ_it
// … σ_it is the standard deviation of unexpected earnings, e_iq − e_iq−4, over the preceding eight quarters」。
// 結果（Table III，1977/1–1993/12 NYSE/AMEX/Nasdaq）：「the arbitrage portfolio (portfolio 10 minus portfolio 1)
// earns a return of 6.8 percent」（六個月）、一年 7.5%；同期第一次盈餘公告的宣告期報酬差 2.4%。
// 版本史：2026-09-21 曾掛顧廣平（2011）三分位（前 33.33%），指標公式也用顧版（含漂移項）；2026-09-22 使用者
// 認為成長動能三支徽章全掛顧廣平太刻意，SUE 換回國際原始出處 CJL 1996，指標公式同步拿掉漂移項（formulaVersion
// 3，見 sueDefinition.ts）——十分位最高一組 = 前 10%。同一輪 netIncomeGrowthRate／earningsToRecordHigh 兩支
// 顧廣平徽章因查無國外對應研究而下架（見 badgeRegistry.ts）。
// 台灣採用實例：顧廣平（2011，管理學報）用含漂移項的變體、三分位，1994–2009 台灣上市櫃 1,459 家，贏家組合
// 顯著為正——放 note 當本土佐證，不當出處。
export const sueBadge: MetricBadge = {
  name: '未預期盈餘最高十分位',
  nameEn: 'Earnings Surprise Top Decile',
  author: 'Louis K. C. Chan, Narasimhan Jegadeesh & Josef Lakonishok, 1996',
  sourceUrl: 'https://www.nber.org/system/files/working_papers/w5375/w5375.pdf',
  summary: '標準化未預期盈餘（SUE）排在全市場最高的十分之一（前 10%），對照 Chan、Jegadeesh 與 Lakonishok（1996）論文十分位排序法中的盈餘動能贏家組合。',
  detail:
    'Chan、Jegadeesh 與 Lakonishok 在 1996 年《Journal of Finance》發表的研究把美國上市公司依標準化未預期盈餘' +
    '（本季盈餘相對去年同季的變動，除以前八季這類變動的標準差）由低到高切成十等分，1977 到 1993 年間最高的一組' +
    '在接下來六個月的報酬比最低的一組高 6.8 個百分點、一年高 7.5 個百分點，而且下一次盈餘公告時市場仍持續對' +
    '這些公司的好消息感到意外——作者把這解讀為股價對盈餘訊息的延遲反應。這是排名，不是絕對數字門檻，照論文的' +
    '十分位定義排；SUE 用跟論文同樣的季節性隨機漫步模型計算，差別是論文用每股盈餘、這裡用單季淨利金額。',
  timeframe: 'Q',
  threshold: {
    description: '前 10%',
    thresholdLatex: '\\mathrm{SUE\\ Percentile} \\geq 90',
    note: 'Chan, Jegadeesh & Lakonishok (1996) 把股票依 SUE 分成十個十分位組合（NYSE 分界點），最高一組即前 10%，不是絕對數字門檻。SUE 定義為（本季盈餘 − 去年同季盈餘）/ 前八季該變動值的標準差；論文用每股盈餘，這裡用單季淨利金額（股數沒有大幅變動時結果相同）。台灣採用實例：顧廣平（2011，管理學報）以含漂移項的變體對 1994–2009 年台灣上市櫃公司做三分位排序，最高一組後續報酬顯著為正。',
    denominator: 1,
    percentileRank: { scope: 'market', direction: 'desc', topPercent: 10 },
  },
};
