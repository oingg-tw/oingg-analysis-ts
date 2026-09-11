import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';
import { altmanZScoreBadge } from './altmanZScoreBadge';

export const altmanZScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'altmanZScore',
  displayName: 'Altman Z-Score 危機預警分數',
  unit: '分',
  formulaNote:
    'Z = 1.2*X1+1.4*X2+3.3*X3+0.6*X4+0.999*X5，X1=(流動資產-流動負債)/總資產、' +
    'X2=保留盈餘/總資產、X3=EBIT(TTM)/總資產、X4=市值/(總負債*1000)、X5=營收(TTM)/總資產。' +
    '獨立重新計算 EBIT(TTM)（公式抄自 interestCoverage，不依賴該 metric_code 已寫入的值）' +
    '跟 X5（公式抄自 assetTurnover，同樣不依賴）。市值查詢複用 resolveKnowledgeDate 的' +
    'knowledge_date，跟第四批 psr/pFcf/evEbitda 同一個套路。只有 TTM 一種 basis——X3/X5' +
    '都需要 TTM 資料才算得出來。原始版模型用上市製造業樣本校準，對非製造業（尤其金融/服務/' +
    '營建）適用性有限，這個警語只在舊架構的 warnings 呈現，PIT 版本不重複記錄使用限制文字' +
    '（metric_value 沒有 warnings 欄位）。',
  formulaLatex: '\\mathrm{Z} = 1.2X_1 + 1.4X_2 + 3.3X_3 + 0.6X_4 + 0.999X_5',
  academicSourceUrl: 'https://doi.org/10.1111/j.1540-6261.1968.tb00843.x',
  referenceUrl: 'https://zh.wikipedia.org/wiki/Z-score%E6%A8%A1%E5%9E%8B',
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '證交所／櫃買中心每日收盤價'],
  badge: altmanZScoreBadge,
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: [
    'current_assets',
    'current_liabilities',
    'assets',
    'retained_earnings',
    'profit_loss_before_tax',
    'finance_costs',
    'liabilities',
    'revenue',
  ],
  currentFormulaVersion: 1,
};
