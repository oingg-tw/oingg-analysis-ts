import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';
import { zmijewskiScoreBadge } from './zmijewskiScoreBadge';

export const zmijewskiScoreDefinition: MetricDefinitionSpec = {
  metricCode: 'zmijewskiScore',
  displayName: 'Zmijewski Score 危機預警分數',
  unit: '分',
  formulaNote:
    'X = -4.3-4.5*(淨利TTM/總資產)+5.7*(總負債/總資產)-0.004*(流動資產/流動負債)。淨利用' +
    'TTM（原始模型用年度財報校準，TTM 是最接近的替代口徑，跟 ROE/ROA 邏輯一致），其餘皆為' +
    '本季資產負債表快照。沒有 YoY，只有 TTM 一種 basis。',
  formulaLatex:
    '\\mathrm{X} = -4.3 - 4.5\\,\\frac{\\mathrm{NetIncome}}{\\mathrm{TotalAssets}} + 5.7\\,\\frac{\\mathrm{TotalLiabilities}}{\\mathrm{TotalAssets}} - 0.004\\,\\frac{\\mathrm{CurrentAssets}}{\\mathrm{CurrentLiabilities}}',
  academicSourceUrl: 'https://doi.org/10.2307/2490859',
  // 2026-09-10 查證過：沒有可靠的中文/英文維基百科專屬條目（只有第三方教學網站），
  // referenceUrl 刻意留空，不要拿不夠權威的頁面充數。
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  badge: zmijewskiScoreBadge,
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: [
    'profit_loss_attributable_to_owners_of_parent',
    'profit_loss',
    'assets',
    'liabilities',
    'current_assets',
    'current_liabilities',
  ],
  currentFormulaVersion: 1,
};
