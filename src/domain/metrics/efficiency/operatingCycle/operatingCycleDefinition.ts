import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

// 2026-09-11 應使用者要求新增（「全市場六季財報深度解鎖的指標」批次）——見
// calculateOperatingCycle.ts 說明，跟既有 cashConversionCycle 同一個資料夾查詢。
export const operatingCycleDefinition: MetricDefinitionSpec = {
  metricCode: 'operatingCycle',
  name: '營運週期',
  unit: '天',
  formulaNote: '= 存貨週轉天數(DIO) + 應收帳款收現天數(DSO)，不扣應付帳款付現天數（DPO）——跟既有 cashConversionCycle（CCC=DIO+DSO-DPO）的差異是這支不考慮付款緩衝期。（2026-09-22 formulaVersion 2：上游週轉率的分母改成期間平均，這支跟著換版；公式本身不變。）',
  formulaLatex: '\\mathrm{OperatingCycle} = \\mathrm{DIO} + \\mathrm{DSO}',
  referenceUrl: 'https://www.investopedia.com/terms/o/operatingcycle.asp',
  tier: 'derived',
  sources: ['公開發行公司資產負債表（XBRL）', '公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['TTM'],
  dependsOn: ['inventories', 'accounts_receivable_net', 'operating_costs', 'revenue'],
  currentFormulaVersion: 2,
};
