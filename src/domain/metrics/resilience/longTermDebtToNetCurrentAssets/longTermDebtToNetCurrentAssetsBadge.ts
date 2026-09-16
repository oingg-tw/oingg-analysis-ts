import type { MetricBadge } from '@/domain/metrics/metricDefinitionSpec';

// Benjamin Graham《The Intelligent Investor》防禦型投資者七條規則之一：「Strong Financial
// Condition」的後半條件（前半是流動比率≥200%，見 currentRatioBadge.ts）——長期負債不超過
// 淨流動資產。淨流動資產 <=0 時這支指標本身回傳 null（見 computeLongTermDebtToNetCurrentAssetsPit.ts
// 的說明），這種情況 currentRatio 那支指標的 ≥200% 門檻早就會標示出來，兩個徽章合起來看
// 才是 Graham 原始規則的完整版本，不要只看其中一個就下結論。
export const longTermDebtToNetCurrentAssetsBadge: MetricBadge = {
  name: '長期負債安全邊際',
  nameEn: 'Long-Term Debt Within Net Current Assets',
  author: 'Benjamin Graham, 1949',
  summary: '長期負債不超過淨流動資產，即使完全不靠固定資產變現也能償還所有長期債務。',
  detail:
    'Benjamin Graham 在《The Intelligent Investor》為「防禦型投資者」訂出的七條選股規則之一' +
    '（財務體質健全測試）的後半條件：長期負債（長期借款+應付公司債）不超過淨流動資產' +
    '（流動資產-流動負債）。這代表就算公司完全不靠廠房設備等固定資產變現，光是淨流動資產' +
    '就足以償還全部長期債務，長期償債能力有充分緩衝。跟 currentRatio（流動比率≥200%）是同一條' +
    'Graham 原始規則的兩半，合起來才是完整的「財務體質健全」測試。',
  timeframe: 'Q',
  threshold: { description: '< 100%', thresholdLatex: '\\mathrm{LongTermDebtToNetCurrentAssets} < 100', note: 'Graham 防禦型投資者財務體質測試的後半條件，即長期負債不超過淨流動資產', denominator: 1, comparator: 'lt', value: 100 },
};
