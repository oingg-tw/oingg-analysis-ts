// 指標的七個因子主題分類——就是 src/domain/metrics/<分類>/ 的資料夾名稱，順序即 GET /metrics 的分類順序。
// 2026-09-09 web-nuxt 回報分類這一層完全沒有中文（前端只能顯示 categoryKey），displayName 跟 key 同一份宣告，
// 不會兩份清單各自維護卻漏改其中一份。`shared/`（dupont/marketRatios 這類一次查詢拆多個 metric_code 的編排）跟
// `chip/`（空殼）不是分類，不在這裡。
export const METRIC_CATEGORIES = [
  { key: 'valuation', displayName: '市場評價' },
  { key: 'dividend', displayName: '股東政策' },
  // 2026-09-21 使用者（經 web-nuxt 轉達）要求「財務韌性」改名「安全韌性」——只改顯示名稱，key 不動。
  // 這個字串流向 GET /metrics 的 category name 與 GET /companies/badges 的 categoryDisplayName。
  // bff-ts 的 /screener/templates 有一列範本剛好也叫「財務韌性」，但那是他們自己的 PresetTemplate 表
  // （name 欄位），跟這裡沒有技術關聯，不會跟著改（bff-ts 2026-09-21 確認）。
  { key: 'resilience', displayName: '安全韌性' },
  { key: 'quality', displayName: '獲利品質' },
  { key: 'profitability', displayName: '獲利能力' },
  { key: 'efficiency', displayName: '營運效率' },
  { key: 'growth', displayName: '成長動能' },
] as const;

export type MetricCategoryKey = (typeof METRIC_CATEGORIES)[number]['key'];
