import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const REVENUE_CAGR_YEARS = [3, 5, 8] as const;

const buildDefinition = (years: number): MetricDefinitionSpec => ({
  metricCode: `revenueCagr${years}y`,
  displayName: `營收${years}年複合成長率`,
  unit: '%',
  formulaNote:
    `= (本年營收 / ${years}年前營收)^(1/${years}) - 1，取「最近一個資料完整的完整會計年度」` +
    `跟「${years}年前的那個完整會計年度」，各自年度營收 = 4 季 operatingRevenue 加總（任一季` +
    '缺漏視為該年度不完整）。基期（N 年前）≤0 → zero_or_negative_denominator，不用更短視窗' +
    '頂替、不產出變號扭曲值。只有 FY 一種 basis。',
  group: 'period',
  allowedPeriodTypes: ['FY'],
  dependsOn: ['revenue'],
  currentFormulaVersion: 1,
});

export const revenueCagrFamilyDefinitions: Record<string, MetricDefinitionSpec> = Object.fromEntries(
  REVENUE_CAGR_YEARS.map((years) => [`revenueCagr${years}y`, buildDefinition(years)])
);
