import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-21：顧廣平、張家瑜、蔡承祐（2025）〈盈餘動能與盈餘創新高動能〉，東吳經濟商學學報 111 期
// 1-36（sourceUrl 是期刊公開全文）。「盈餘創新高動能」是顧廣平本人首創（2022 年先做月營收版，本文
// 延伸到季盈餘），原始提出者無疑義。方法論逐字（第 7 頁「二、動能策略」）：「每個月依照最近公布…
// 單季盈餘對歷史最高單季盈餘比率指標高低平均分成 5 個投資組合，指標數據最高組合為…贏家組合(R5)」，
// 結論頁再確認「區分贏家組合(前 20%)與輸家組合(後 20%)」。樣本 1988-2022 台灣上市櫃全市場，前 20%
// 贏家組合持有 1-12 個月平均報酬顯著為正、且在多數情況下優於單純的盈餘動能。
//
// 用 percentileRank 忠實還原「前 20%」；scope 選 market——論文排名母體是台灣上市櫃全市場不分產業。
// 指標本身採論文附註 1 驗證過等價的「近三年最高」變體，見 earningsToRecordHighDefinition.ts 檔頭。
export const earningsToRecordHighBadge: MetricBadge = {
  name: '盈餘創新高前 20%',
  nameEn: 'Record-High Earnings Momentum Top Quintile',
  author: '顧廣平、張家瑜、蔡承祐, 2025',
  sourceUrl: 'https://business.scu.edu.tw/sites/default/files/2025-12/IJ-01.PDF',
  summary: '本季淨利相對近三年最高單季淨利的比率排在全市場前 20%，對照顧廣平等（2025）「盈餘創新高動能」贏家組合的定義。',
  detail:
    '淡江大學顧廣平等人 2025 年以 1988–2022 年台灣上市櫃股票驗證：把公司依「本季淨利 / 歷史最高單季' +
    '淨利」由低到高切成五等分，最高的一組（前 20%，越接近或超越自己的歷史高點）在後續 1 到 12 個月' +
    '的平均報酬顯著高於最低的一組，而且比傳統的盈餘年增率動能更穩定。論文也驗證把「歷史最高」限定在' +
    '近三年結果幾乎相同，本站沿用論文附註的近三年變體。這是排名，不是絕對數字門檻，直接沿用論文的五分位定義。',
  timeframe: 'Q',
  threshold: {
    description: '前 20%',
    thresholdLatex: '\\mathrm{EarningsToRecordHigh\\ Percentile} \\geq 80',
    note: '顧廣平等（2025）每月依指標高低均分五組，最高一組（前 20%）為贏家組合，不是絕對數字門檻。',
    denominator: 1,
    percentileRank: { scope: 'market', direction: 'desc', topPercent: 20 },
  },
};
