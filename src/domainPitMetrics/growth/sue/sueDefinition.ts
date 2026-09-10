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
  badge: {
    id: 'sue',
    name: '標準化未預期盈餘 (SUE)',
    nameEn: 'Standardized Unexpected Earnings',
    author: 'Foster, Olsen & Shevlin, 1984, Bernard & Thomas, 1989',
    summary: '本季盈餘意外程度的標準化分數，數值越高代表這季獲利遠超市場對「正常」的預期。',
    detail:
      'SUE 是「未預期盈餘」（UE，本季單季 EPS 減去去年同季單季 EPS）除以近 20 季 UE 的樣本標準差算出的' +
      '標準化分數，源自 Foster, Olsen & Shevlin 1984 年的原始研究，後由 Bernard & Thomas 1989 年的論文確立' +
      '為 PEAD（盈餘公告後漂移）文獻中最常引用的旗艦指標——他們發現財報公布後，SUE 越極端的股票，其超額' +
      '報酬在接下來數季會持續同方向漂移，而不是財報公布當下就立刻完全反映。這是一個統計上的異常現象，反映' +
      '市場對盈餘意外的反應存在延遲，不代表未來報酬保證延續此模式。',
    token: 'Q',
    threshold: { description: '> 2（PEAD 文獻常用的顯著正向盈餘意外門檻）', denominator: 1, comparator: 'gt', value: 2 },
  },
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'paidInShares'],
  currentFormulaVersion: 1,
};
