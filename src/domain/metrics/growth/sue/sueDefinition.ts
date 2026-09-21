import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-21 公式換版（currentFormulaVersion 1 → 2）：原本是 Bernard & Thomas (1989) 的 EPS 版
// （UE = EPS_t − EPS_{t−4}，σ 取最近 20 期 UE），實測全市場最新一季只有 2330 算得出來（要 24 季 EPS
// 還卡股本缺口）。改採顧廣平（2011）〈盈餘與營收動能〉對台灣市場的定義（管理學報 28(6) 第 525 頁式 (2)，
// 已逐字核對）：用單季稅後盈餘金額、含漂移項 μ、μ 與 σ 取前 8 季盈餘變動值——只要 13 季淨利，全市場都
// 算得出來，且顧 2011 同時是徽章「未預期盈餘前三分位」的出處。PEAD 的原始文獻（Ball & Brown 1968、Bernard &
// Thomas 1989）放 referenceUrl 那條維基頁的脈絡裡，academicSourceUrl 改指本站實際採用的這個定義的出處。
export const sueDefinition: MetricDefinitionSpec = {
  metricCode: 'sue',
  name: 'SUE',
  unit: '分',
  formulaNote:
    'SUE_t = (E_t − E_{t−4} − μ) / σ，E 是單季稅後淨利（金額，歸屬母公司優先，缺漏退回整體口徑），' +
    'μ、σ 是前 8 季（t−1 至 t−8）盈餘變動值 E_i − E_{i−4} 的平均數與樣本標準差（有漂移項的季節性隨機' +
    '漫步，顧廣平 2011）。共需 13 季淨利，任一季缺漏為 insufficient_history，不用更少期數頂替；σ = 0 為' +
    ' zero_or_negative_denominator。只有 Q 一種 basis——本質是單季盈餘意外，沒有 TTM 概念。' +
    '（2026-09-21 前是 EPS、無漂移項、σ 取 20 期 UE 的 Bernard & Thomas 版，formulaVersion 1。）',
  // \sigma(\mathrm{UE}) 這種函式呼叫寫法會被 compute-engine 剖析成乘法（2026-09-10 實測），用下標寫法。
  formulaLatex: '\\mathrm{SUE}_t = \\frac{(E_t - E_{t-4}) - \\mu_{\\Delta E}}{\\sigma_{\\Delta E}}',
  academicSourceUrl: 'https://jom.management.org.tw/upload/alistfs141102023023172.pdf',
  referenceUrl: 'https://en.wikipedia.org/wiki/Post%E2%80%93earnings-announcement_drift',
  tier: 'composite',
  sources: ['公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss'],
  currentFormulaVersion: 2,
};
