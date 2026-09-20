import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';

export const consecutiveProfitYearsDefinition: MetricDefinitionSpec = {
  metricCode: 'consecutiveProfitYears',
  name: '連續獲利年數',
  unit: '年',
  formulaNote:
    '從最近一個資料完整（四季損益表皆有資料）的完整會計年度開始往回數，逐年檢查該年度' +
    '淨利（歸屬母公司優先，缺漏退回整體口徑）加總是否為正，遇到虧損（≤0）或該年度資料不' +
    '完整就停止計數，跟 consecutiveDividendYears 同一套「逐年往回數」設計（見該檔案說明）。' +
    '只有 FY 一種 basis。value=0 代表「有資料、確定最近一個完整年度虧損」，null 代表' +
    '「連最近一年資料都拿不到」，兩者不同。',
  // 2026-09-20 移除原本的 referenceUrl（stockopedia 的 EPS Streak 條目）——實際打開確認那頁
  // 量的是「過去 5 年中獲利幾次」，跟本指標「連續獲利年數」與徽章的 10 年門檻直接矛盾，
  // 使用者點過去會看到不一致的數字。找不到可驗證的替代頁面，寧可留空也不放會誤導的。
  tier: 'derived',
  sources: ['公開發行公司損益表（XBRL）'],
  group: 'period',
  allowedPeriodTypes: ['FY'],
  dependsOn: ['profit_loss_attributable_to_owners_of_parent', 'profit_loss'],
  currentFormulaVersion: 1,
};
