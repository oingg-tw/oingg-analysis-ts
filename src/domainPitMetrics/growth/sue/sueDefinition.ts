import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const sueDefinition: MetricDefinitionSpec = {
  metricCode: 'sue',
  displayName: '標準化未預期盈餘 (SUE)',
  unit: '分',
  formulaNote:
    'SUE_t = UE_t / σ(UE)，UE_i = 單季 EPS_i − 去年同季單季 EPS_{i-4}（季節性隨機漫步版，' +
    'Foster, Olsen & Shevlin 1984；Bernard & Thomas 1989，PEAD 文獻旗艦指標）。σ 用最近' +
    '最多 8 期、至少 4 期 UE 的樣本標準差估計（原始論文用 20 季，但那需要 5 年逐季 EPS，' +
    '目前資料深度普遍不到，改用 variant_of 的較短窗口，見 computeSuePit.ts 說明）。少於 4 期' +
    'UE 可估計視為 insufficient_history，不用更少期數頂替。只有 Q 一種 basis——本質是單季' +
    '盈餘意外，沒有 TTM 概念。',
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
  currentFormulaVersion: 1,
};
