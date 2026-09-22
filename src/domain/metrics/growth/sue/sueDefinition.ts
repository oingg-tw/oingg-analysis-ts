import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 版本史：v1（2026-09-10）Bernard & Thomas (1989) 的 EPS 版（σ 取最近 20 期 UE），全市場最新一季只有 2330
// 算得出來（要 24 季 EPS 還卡股本缺口）；v2（2026-09-21）顧廣平（2011）版（淨利金額、含漂移項 μ、μσ 取前 8 季），
// 13 季即可；v3（2026-09-22）照 Chan, Jegadeesh & Lakonishok (1996)《Momentum Strategies》（JF 51(5) 第 1685 頁）
// 的定義，拿掉漂移項：SUE = (E_t − E_{t−4}) / σ，σ 取前 8 季盈餘變動值的標準差——這是國際文獻最常用的 SUE
// 定義（Novy-Marx 2015 亦同），也是徽章「未預期盈餘最高十分位」的出處；換的理由是使用者不想三支成長動能徽章
// 都掛同一位台灣學者。跟原文的落差（EPS → 淨利金額）見 computeSue.ts 檔頭。PEAD 的原始文獻（Ball & Brown 1968、
// Bernard & Thomas 1989）放 referenceUrl 那條維基頁的脈絡裡。
export const sueDefinition: MetricDefinitionSpec = {
  metricCode: 'sue',
  name: 'SUE',
  unit: '分',
  formulaNote:
    'SUE_t = (E_t − E_{t−4}) / σ，E 是單季稅後淨利（金額，歸屬母公司優先，缺漏退回整體口徑），' +
    'σ 是前 8 季（t−1 至 t−8）盈餘變動值 E_i − E_{i−4} 的樣本標準差（季節性隨機漫步，Chan, Jegadeesh & ' +
    'Lakonishok 1996；原文用 EPS，這裡用淨利金額）。共需 13 季淨利，任一季缺漏為 insufficient_history，不用' +
    '更少期數頂替；σ = 0 為 zero_or_negative_denominator。只有 Q 一種 basis——本質是單季盈餘意外，沒有 TTM 概念。' +
    '（formulaVersion 1 是 Bernard & Thomas 的 EPS／20 期版，2 是顧廣平 2011 含漂移項版。）',
  // \sigma(\mathrm{UE}) 這種函式呼叫寫法會被 compute-engine 剖析成乘法（2026-09-10 實測），用下標寫法。
  formulaLatex: '\\mathrm{SUE}_t = \\frac{E_t - E_{t-4}}{\\sigma_{\\Delta E}}',
  academicSourceUrl: 'https://www.nber.org/system/files/working_papers/w5375/w5375.pdf',
  referenceUrl: 'https://en.wikipedia.org/wiki/Post%E2%80%93earnings-announcement_drift',
  tier: 'composite',
  sources: ['公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss'],
  currentFormulaVersion: 3,
};
