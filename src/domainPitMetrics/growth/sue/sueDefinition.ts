import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';
import { sueBadge } from './sueBadge';

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
  // \sigma(\mathrm{UE})（函式呼叫寫法）會被 compute-engine 剖析成「\sigma 乘以 UE」，
  // 不是「UE 的標準差」——2026-09-10 實測驗證過。改用下標寫法 \sigma_{\mathrm{UE}}，
  // 還原成單一符號 sigma_UE，不會被拆成乘法。
  formulaLatex: '\\mathrm{SUE}_t = \\frac{\\mathrm{UE}_t}{\\sigma_{\\mathrm{UE}}},\\quad \\mathrm{UE}_i = \\mathrm{EPS}_i - \\mathrm{EPS}_{i-4}',
  // 兩篇論文都是這支指標的出處（見上面 formulaNote），academicSourceUrl 只能放一個連結，
  // 選 Bernard & Thomas 1989——PEAD 文獻裡最常被引用的旗艦論文；Foster, Olsen & Shevlin
  // 1984 的 DOI 是 https://doi.org/10.2308/tar-4483133，這裡不重複放第二個欄位。
  academicSourceUrl: 'https://doi.org/10.2307/2491062',
  referenceUrl: 'https://en.wikipedia.org/wiki/Post%E2%80%93earnings-announcement_drift',
  tier: 'composite',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  badge: sueBadge,
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
  currentFormulaVersion: 1,
};
