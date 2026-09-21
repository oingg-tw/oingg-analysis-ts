import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-21：顧廣平（2011）〈盈餘與營收動能〉，管理學報 28(6):521-544（sourceUrl 是期刊公開全文，
// 已開 PDF 逐字核對）。2026-09-20 第二輪曾因「Foster/Olsen/Shevlin 1984、Bernard/Thomas 1989 用十分位
// 排序、論文本身從未訂過 > 2 這種絕對切點」下架 sueBadge；現在 (1) 有 percentileRank 可以忠實表達排名，
// (2) sue 指標本身已換成顧 2011 的定義（見 sueDefinition.ts），出處與指標定義同一篇。方法論逐字
// （第 526 頁「動能策略」）：「首先依每月個別股票之 SUE…均分成 3 個組合 E1、E2、E3…其中 SUE…最高之
// 組合 E3 為盈餘…贏家組合」，1994-2009 台灣上市櫃 1,459 家。三分位最高組 = 前 33.33%，percentileRank
// 的 topPercent 用 33.33（rank/total ≤ 0.3333）。scope market——論文母體是全市場不分產業。
export const sueBadge: MetricBadge = {
  // 2026-09-21 使用者要求改名：原本「SUE 前 1/3」縮寫不透明、1/3 寫法跟其他 percentile 徽章（五分位/前四分位/
  // 最低十分位）不一致，改用論文自己的「未預期盈餘」＋「三分位」。
  name: '未預期盈餘前三分位',
  nameEn: 'Earnings Surprise Top Tercile',
  author: '顧廣平, 2011',
  sourceUrl: 'https://jom.management.org.tw/upload/alistfs141102023023172.pdf',
  summary: '標準化未預期盈餘（SUE）排在全市場最高的三分之一，對照顧廣平（2011）以台灣市場驗證的盈餘動能贏家組合定義。',
  detail:
    '淡江大學顧廣平 2011 年以 1994–2009 年台灣上市櫃股票驗證：把公司依標準化未預期盈餘（本季淨利相對' +
    '去年同季的變動，扣掉過去八季的平均變動後除以其標準差）由低到高分成三組，最高的一組（前 1/3）在後續' +
    '持有期的平均報酬顯著高於最低的一組，且與營收動能各自獨立存在。這是排名，不是絕對數字門檻，本站直接' +
    '沿用論文的三分位定義。',
  timeframe: 'Q',
  threshold: {
    description: '前三分位',
    thresholdLatex: '\\mathrm{SUE\\ Percentile} \\geq 66.67',
    note: '顧廣平（2011）每月依 SUE 高低均分三組，最高一組（前 1/3）為贏家組合，不是絕對數字門檻。',
    denominator: 1,
    percentileRank: { scope: 'market', direction: 'desc', topPercent: 33.33 },
  },
};
