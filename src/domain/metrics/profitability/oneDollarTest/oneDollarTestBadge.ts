import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// Warren Buffett 在 1983 年 Berkshire Hathaway 致股東信提出的「一美元原則」：每保留一美元
// 盈餘不發放，市場長期應該至少為股東創造一美元市值，否則這些保留下來的資金還不如直接發還
// 股東。原信裡是拿整個 Berkshire 的長期歷史當範例，沒有訂出一個放諸四海皆準的固定年數，
// 5 年窗口出自 1984 年致股東信「Dividend Policy」一節（2026-09-22 fetch 驗證逐字）：「Because our year-to-year results are
// inherently volatile, we believe a five-year rolling average to be appropriate for judging the historical record」——
// 同一節也重述了「for every dollar retained by the corporation, at least one dollar of market value will be created
// for owners」，所以 sourceUrl 改指 1984 年信，一個 URL 同時看得到門檻與年數；author 年份維持首次提出的 1983。
export const oneDollarTestBadge: MetricBadge = {
  name: '一美元原則',
  nameEn: 'One Dollar Premise',
  author: 'Warren Buffett, 1983',
  // 2026-09-20 sourceUrl 實際 fetch 驗證：Berkshire 官網 1983 年致股東信原文，逐字寫著 delivers shareholders at least $1 of market value for each $1 retained。
  sourceUrl: 'https://www.berkshirehathaway.com/letters/1984.html',
  summary: '近 5 年累計保留盈餘，至少為股東創造了等值的市值成長，資本配置沒有摧毀價值。',
  detail:
    'Warren Buffett 在 1983 年 Berkshire Hathaway 致股東信提出的資本配置檢驗標準：公司' +
    '每保留一美元盈餘不發放（不管是拿去再投資、併購還是單純留在帳上），長期應該至少為股東' +
    '創造一美元的市值增加，否則這些保留下來的資金還不如直接以股利形式發還股東，讓股東自己' +
    '決定怎麼運用。窗口照 Buffett 1984 年致股東信「五年滾動平均」的做法，取近 5 個完整會計年度：分子是這段期間的市值淨變化，分母是同' +
    '期間累計保留盈餘（淨利加總扣掉股利發放現金）。比率低於 1 代表管理層把盈餘留在公司裡' +
    '創造的市值，還不如直接發還股東；比率為負或分母不是正值時，代表這段期間累計虧損或' +
    '股利發得比淨利還多，一美元原則的除法本身沒有意義。',
  timeframe: 'FY',
  threshold: { description: '≥ 1 倍', thresholdLatex: '\\mathrm{OneDollarTest} \\geq 1', note: '5 年窗口照 Buffett 1984 年致股東信「we believe a five-year rolling average to be appropriate」的做法；分母為 0 或負值時無法判定，不是未達成', denominator: 1, comparator: 'gte', value: 1 },
};
