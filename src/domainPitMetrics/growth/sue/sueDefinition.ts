import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const sueDefinition: MetricDefinitionSpec = {
  metricCode: 'sue',
  displayName: '標準化未預期盈餘 (SUE)',
  unit: '分',
  formulaNote:
    'SUE_t = UE_t / σ(UE)，UE_i = 單季 EPS_i − 去年同季單季 EPS_{i-4}（季節性隨機漫步版，' +
    'Foster, Olsen & Shevlin 1984；Bernard & Thomas 1989，PEAD 文獻旗艦指標）。σ 用最近' +
    '20 期 UE 的樣本標準差估計，跟原始論文一致——不是縮短版，2026-09-10 實測驗證過資料' +
    '深度足夠（至少連續回溯到 108Q3，28 季無缺口）。少於 20 期 UE 可估計視為' +
    ' insufficient_history，不用更少期數頂替（不自訂較短視窗）。只有 Q 一種 basis——本質是' +
    '單季盈餘意外，沒有 TTM 概念。',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
  currentFormulaVersion: 1,
};
