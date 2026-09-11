import type { MetricDefinitionSpec } from '@/domainPitMetrics/metricDefinitionSpec';

// 2026-09-11 應 web-nuxt 要求新增——marketCap 的即時版本，見 computeLiveMarketCapPit.ts
// 檔頭說明。跟 marketCap（凍結在財報公告當天）一樣，本身不設 badge（不是可以獨立比較
// 門檻的指標，是給 ncav 等其他指標拿來即時比較用的支援性數字）——前端可以直接拿
// ncav.Q 跟這支的 liveMarketCap.EOD 做「現在貴不貴」的即時比較，用法跟既有 ncavBadge
// 拿 marketCap.Q 做季報快照比較是同一個模式，只是換成即時的一邊。
export const liveMarketCapDefinition: MetricDefinitionSpec = {
  metricCode: 'liveMarketCap',
  displayName: '市值（即時）',
  unit: '元',
  formulaNote:
    '= 當下最新收盤價 × 當下最新已申報流通股數（新台幣元）。跟 marketCap（凍結在財報公告當天的' +
    'knowledge_date）是刻意並存、互不影響的兩支獨立 metricCode，每個交易日都會變動。查無股價或股本' +
    '資料時為 null（missing_input）。',
  formulaLatex: '\\mathrm{LiveMarketCap} = \\mathrm{Price}_{\\mathrm{latest}} \\times \\mathrm{SharesOutstanding}',
  referenceUrl: 'https://en.wikipedia.org/wiki/Market_capitalization',
  tier: 'derived',
  sources: ['證交所／櫃買中心每日收盤價', '公開發行公司股本變動申報'],
  group: 'snapshot',
  allowedSnapshotCadences: ['EOD'],
  dependsOn: ['paidInShares', 'daily_price.close'],
  currentFormulaVersion: 1,
};
