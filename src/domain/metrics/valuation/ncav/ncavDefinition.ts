import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const ncavDefinition: MetricDefinitionSpec = {
  metricCode: 'ncav',
  name: '淨流動資產價值',
  unit: '元',
  // 2026-09-10 改回公司總額，不除以股數——跟維基百科 Net current asset value 條目定義
  // 的寫法一致（NCAV = Total Current Assets − Total Liabilities，MC = Shares × Price，
  // 兩者都是總額直接比較，不是每股 NCAV vs 每股股價這種隱含除以股數的寫法）。原本除以
  // 股數是為了跟 stockPrice（每股）比較，現在改跟新增的 marketCap（見
  // marketCapDefinition.ts）比較，兩邊都是總額，不需要股數這個中介變數。特別股股本
  // 沿用既有慣例扣除（清算時特別股求償順位優先於普通股，Graham/Dodd 原始論述隱含這層
  // 意思，維基百科條目本身沒有明講但不扣除會高估普通股股東能拿到的剩餘價值）。
  formulaNote: '= 本季期末流動資產 − 總負債 − 特別股股本（新台幣元，公司總額）。純資產負債表時點快照，只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{NCAV} = \\mathrm{CurrentAssets} - \\mathrm{TotalLiabilities} - \\mathrm{PreferredStock}',
  // 2026-09-20 移除原本的 academicSourceUrl（archive.org/details/dli.ernet.7983）——實際打開
  // 確認那是 **1940 年版、作者只掛 David Dodd 一人**的 Security Analysis，跟本指標宣稱的出處
  // 「Graham & Dodd, 1934」年份與作者都對不上；archive.org 上目前也查不到 1934 年初版的公開
  // 掃描本（最早只到 1951 年版）。referenceUrl 的英文維基條目已驗證有完整公式並明確指出概念
  // 出自 Graham 1934 年的 Security Analysis，使用者查證管道不受影響。
  referenceUrl: 'https://en.wikipedia.org/wiki/Net_current_asset_value',
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['current_assets', 'liabilities'],
  currentFormulaVersion: 1,
};
