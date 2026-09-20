import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const longTermDebtToNetCurrentAssetsDefinition: MetricDefinitionSpec = {
  metricCode: 'longTermDebtToNetCurrentAssets',
  name: '長期負債對淨流動資產比',
  unit: '%',
  formulaNote:
    '= 長期負債(長期借款+應付公司債非流動部分)/淨流動資產(流動資產-流動負債)*100。淨流動' +
    '資產 <=0 時不計算（zero_or_negative_denominator，分母變號會讓比率語意反過來，這種情況' +
    'currentRatio<100% 早就會標示出來）。純資產負債表時點快照，只有 Q 一種 basis。',
  formulaLatex: '\\mathrm{LongTermDebtToNetCurrentAssets} = \\frac{\\mathrm{LongTermDebt}}{\\mathrm{CurrentAssets} - \\mathrm{CurrentLiabilities}} \\times 100',
  // 2026-09-20 移除原本的 referenceUrl（中文維基「安全邊際」）——實際打開確認那個條目講的是
  // 管理會計的「損益兩平安全邊際」（預期銷貨額超過損益兩平點的部分），跟本指標「長期負債不
  // 超過淨流動資產」這條 Graham 資產負債表規則**完全是不同概念**，使用者點過去只會被誤導。
  // 目前找不到可驗證、有逐字寫出這條規則的公開中文頁面，寧可留空也不放錯的（見
  // feedback_data_source_field_use_public_url）。
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['Q'],
  dependsOn: ['longterm_borrowings', 'noncurrent_portion_of_bonds_issued', 'current_assets', 'current_liabilities'],
  currentFormulaVersion: 1,
};
