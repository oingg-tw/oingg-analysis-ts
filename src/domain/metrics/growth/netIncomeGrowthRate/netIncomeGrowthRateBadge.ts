import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-21：顧廣平、張家瑜、蔡承祐（2025）〈盈餘動能與盈餘創新高動能〉，東吳經濟商學學報 111 期
// （sourceUrl 是期刊公開全文）。「盈餘動能」本身源自 Ball & Brown (1968) 的盈餘宣告後漂移，但這裡
// 引用的是顧廣平等人**用季盈餘年增率、對台灣市場**定義的版本：第 6 頁「未預期盈餘為…（最近公告單季
// 稅後盈餘 – 去年同季單季稅後盈餘）/（去年同季單季稅後盈餘絕對值）」，跟本站 netIncomeGrowthRate 的
// 公式逐字相同；第 7 頁「每個月依照最近公布未預期盈餘…指標高低平均分成 5 個投資組合，指標數據最高
// 組合為盈餘…贏家組合(R5)」，結論頁「贏家組合(前 20%)」。1988-2022 台灣上市櫃全市場，前 20% 持有
// 1-12 個月平均報酬顯著為正。
//
// 用 percentileRank 忠實還原「前 20%」；scope 選 market——論文排名母體是台灣上市櫃全市場不分產業。
export const netIncomeGrowthRateBadge: MetricBadge = {
  name: '盈餘動能前 20%',
  nameEn: 'Earnings Momentum Top Quintile',
  author: '顧廣平、張家瑜、蔡承祐, 2025',
  sourceUrl: 'https://business.scu.edu.tw/sites/default/files/2025-12/IJ-01.PDF',
  summary: '單季淨利年增率排在全市場前 20%，對照顧廣平等（2025）以台灣市場驗證的「盈餘動能」贏家組合定義。',
  detail:
    '淡江大學顧廣平等人 2025 年以 1988–2022 年台灣上市櫃股票驗證：把公司依單季淨利年增率（本季淨利' +
    '相對去年同季的變化）由低到高切成五等分，最高的一組（前 20%）在後續 1 到 12 個月的平均報酬顯著' +
    '高於最低的一組，效應在控制風險因子、景氣循環、上市櫃別後仍然存在；長期累積報酬顯示投資人對' +
    '盈餘好消息傾向過度反應、對壞消息反應不足。這是排名，不是絕對數字門檻，照論文的五分位定義排。',
  timeframe: 'Q',
  threshold: {
    description: '前 20%',
    thresholdLatex: '\\mathrm{NetIncomeGrowthRate\\ Percentile} \\geq 80',
    note: '顧廣平等（2025）每月依指標高低均分五組，最高一組（前 20%）為贏家組合，不是絕對數字門檻。',
    denominator: 1,
    percentileRank: { scope: 'market', direction: 'desc', topPercent: 20 },
  },
};
