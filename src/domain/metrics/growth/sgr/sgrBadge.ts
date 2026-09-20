import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// Robert C. Higgins（1977《How Much Growth Can a Firm Afford?》）提出的永續成長率模型：
// 在不改變負債權益比、不增發新股的前提下，公司靠自身獲利能力最多能撐多快的成長。當實際
// 營收成長率持續超過永續成長率，代表這個成長速度得靠舉債或增資撐，是財務體質的警訊（不是
// 買入/賣出建議，是風險提示，跟 Beneish M-Score/Altman Z-Score 同一種性質）。這裡用
// revenueCagr3y（3 年營收複合成長率）當「實際成長」的比較對象，比單季年增率更符合
// Higgins 原始模型「持續性」的概念，不是逐季波動的雜訊。
export const sgrBadge: MetricBadge = {
  name: 'Higgins 永續成長率警訊',
  nameEn: "Higgins's Sustainable Growth Warning",
  author: 'Robert C. Higgins, 1977',
  // 2026-09-20 sourceUrl 實際 fetch 驗證：有 SGR 完整公式並在參考文獻逐字引用 Higgins, Robert (1977): How much growth can a firm afford。本徽章門檻是「實際成長率 > SGR」的模型比較，不是固定數字，出處頁涵蓋模型本身。
  sourceUrl: 'https://en.wikipedia.org/wiki/Sustainable_growth_rate',
  summary: '近 3 年實際營收成長率持續超過永續成長率，成長速度可能得靠舉債或增資撐，是財務體質的警訊。',
  detail:
    'Robert C. Higgins 提出的永續成長率（SGR）模型：在不改變負債權益比、不增發新股的' +
    '前提下，公司單靠保留盈餘再投資最多能撐多快的成長速度（= ROE × 保留盈餘比率）。當公司' +
    '過去 3 年實際營收成長率持續超過這個永續成長率，代表這段期間的成長得靠額外舉債或增資' +
    '才撐得住，長期下來容易演變成資產負債表過度槓桿或股權稀釋——這是一個風險提示訊號，不是' +
    '買入或賣出的建議，跟 Beneish M-Score/Altman Z-Score 這類警訊型徽章同一種性質。',
  timeframe: 'TTM',
  threshold: { description: '實際成長率(3年) > SGR', thresholdLatex: '\\mathrm{RevenueCagr}_{3y} > \\mathrm{SGR}', note: '用 3 年營收複合成長率當「實際成長」的比較對象，比單季年增率更符合 Higgins 模型的持續性概念', denominator: 1, comparator: 'gt', compareAgainstFieldId: 'revenueCagr3y.FY' },
};
