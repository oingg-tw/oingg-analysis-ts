import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';
import { ncavBadge } from './ncavBadge';

export const ncavDefinition: MetricDefinitionSpec = {
  metricCode: 'ncav',
  displayName: '淨流動資產價值 (NCAV)',
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
  // 出處是葛拉漢與陶德《Security Analysis》(1934)，不是期刊論文——archive.org 上這個
  // 掃描本完全公開免費，不需要借閱帳號。
  academicSourceUrl: 'https://archive.org/details/dli.ernet.7983',
  referenceUrl: 'https://en.wikipedia.org/wiki/Net_current_asset_value',
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）'],
  badge: ncavBadge,
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['current_assets', 'liabilities'],
  currentFormulaVersion: 1,
};
