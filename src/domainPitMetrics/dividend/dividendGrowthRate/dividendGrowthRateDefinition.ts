import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

export const DIVIDEND_GROWTH_RATE_YEARS = [3, 5, 8] as const;

const buildDefinition = (years: number): MetricDefinitionSpec => ({
  metricCode: `dividendGrowthRate${years}y`,
  folderName: 'dividendGrowthRate',
  name: `現金流量股利${years}年成長率`,
  unit: '%',
  formulaNote:
    'variant_of：原始定義用精確的「每股宣告股利」N 年 CAGR，該資料源（mops-ts ' +
    'DividendDistribution）目前覆蓋率太低還不能用（見 TECH_DEBT.md）。這裡改用現金流量表' +
    '「發放股利」(dividendsPaid) 除以當年 Q4 報告日流通股數近似每股股利，兩個年度（最近一個' +
    `資料完整的完整會計年度、跟 ${years} 年前的那個完整會計年度）算 CAGR = ` +
    `(DPS_t/DPS_{t-${years}})^(1/${years})-1*100。股本有異動的年度會失真（現金增資稀釋、減資` +
    '墊高），股本長期穩定的公司這個近似值會非常接近真值，使用前建議對照 shareCountChangeRate。' +
    '任一年度 4 季 dividendsPaid 不齊（或該年度整個查不到）視為 insufficient_history，不用' +
    '更短視窗頂替。基期（N 年前）≤0（該年度沒配息）視為 zero_or_negative_denominator，不產出' +
    '變號扭曲值。只有 FY 一種 basis。',
  formulaLatex: `\\mathrm{DividendGrowthRate}_{${years}y} = \\left(\\left(\\frac{\\mathrm{DPS}_t}{\\mathrm{DPS}_{t-${years}}}\\right)^{1/${years}} - 1\\right) \\times 100`,
  tier: 'derived',
  sources: ['公開發行公司現金流量表（XBRL）', '公開發行公司股本變動申報'],
  group: 'period',
  allowedPeriodTypes: ['FY'],
  dependsOn: ['dividendsPaid', 'paidInShares'],
  currentFormulaVersion: 1,
});

export const dividendGrowthRateFamilyDefinitions: Record<string, MetricDefinitionSpec> = Object.fromEntries(
  DIVIDEND_GROWTH_RATE_YEARS.map((years) => [`dividendGrowthRate${years}y`, buildDefinition(years)])
);
