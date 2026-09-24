import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const expectedCreditLossPerShareDefinition: MetricDefinitionSpec = {
  metricCode: 'expectedCreditLossPerShare',
  name: '每股預期信用減損損失',
  nameEn: 'Expected Credit Loss Per Share',
  unit: '元',
  formulaNote:
    'Q = 當季預期信用減損損失（IFRS 9，impairment_loss_gain_reversal_ifrs9）*1000/流通股數；' +
    'TTM = 近四季（含本季）加總*1000/流通股數，四季不齊為 null。流通股數固定用「本季報告日」' +
    '當下有效的股本。這是營業費用的**第四個組成**——推銷+管理+研發不一定等於營業費用合計，' +
    '差額就是它（實測 115Q2 有 1,445 家揭露，四項相加後 1,543/1,545 列完全還原）。' +
    '2026-09-24 為了讓「營收→股利」瀑布圖的營業費用那一段能加總還原而新增。',
  formulaLatex: '\\mathrm{ExpectedCreditLossPerShare} = \\frac{\\mathrm{ExpectedCreditLoss}}{\\mathrm{Shares}}',
  referenceUrl: 'https://www.ifrs.org/issued-standards/list-of-standards/ifrs-9-financial-instruments/',
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['Q', 'TTM'],
  dependsOn: ['impairment_loss_gain_reversal_ifrs9', 'paidInShares'],
  currentFormulaVersion: 1,
};
