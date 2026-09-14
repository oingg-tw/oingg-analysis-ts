import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-11 應 web-nuxt 要求新增——grahamNumber 的即時版本，見
// computeLiveGrahamNumberPit.ts 檔頭說明。逐日型（snapshot），不是季報型，跟 grahamNumber
// 的 group:'period' 不同。
export const liveGrahamNumberDefinition: MetricDefinitionSpec = {
  metricCode: 'liveGrahamNumber',
  name: '葛拉漢數字',
  nameSuffix: '即時',
  unit: '倍',
  formulaNote:
    '= PER(TTM，當下最新收盤價/最新已申報 EPS TTM) × PBR（當下最新收盤價/最新已申報 BVPS）。基本面跟' +
    'grahamNumber 完全相同，股價改用當下最新收盤價，每個交易日更新，跟 grahamNumber（凍結在財報公告' +
    '當天）是刻意並存、互不影響的兩支獨立 metricCode。',
  formulaLatex: '\\mathrm{LiveGrahamNumber} = \\mathrm{PER}_{\\mathrm{TTM}} \\times \\mathrm{PBR}',
  academicSourceUrl: 'https://archive.org/details/intelligentinves00grah_1',
  referenceUrl: 'https://en.wikipedia.org/wiki/Graham_number',
  tier: 'composite',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）', '公開發行公司股本變動申報', '證交所／櫃買中心每日收盤價'],
  group: 'snapshot',
  allowedSnapshotCadences: ['EOD'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss', 'equity_attributable_to_owners_of_parent', 'equity', 'paidInShares', 'daily_price.close'],
  currentFormulaVersion: 1,
};
