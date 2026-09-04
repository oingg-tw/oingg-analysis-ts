// 2026-09-05 起這裡只是薄殼合併層——實際的 44 支「單一公司、有 calculate* 函式」指標分別
// 登記在 ./daily/indicatorRegistry.ts（10 支，依賴每日股價/市場行情）跟
// ./quarterly/indicatorRegistry.ts（34 支，依賴季度財報），兩份彼此獨立、依 getCompanyIds
// 的公司清單來源分組，不是憑感覺分（見各自檔案開頭的說明）。
//
// 這裡合併回單一 indicatorJobs 清單，唯一的用途是給
// src/domainApi/companies/metricsService.ts 的 compute-on-miss 用——那個情境要查任何一支
// 指標（不分頻率），也是 scripts/batchComputeIndicators.ts（CLI 手動觸發，維持一次跑全部
// 的行為）用的清單。`macro/equityRiskPremium`（全市場單一值，沒有 symbol）跟
// `valuation/ranking`（本身是跨公司排行端點）不適用「單一公司」這個模式，兩份 registry 都
// 沒有列進來。
export { dailyIndicatorJobs } from './daily/indicatorRegistry';
export { quarterlyIndicatorJobs } from './quarterly/indicatorRegistry';
export type { IndicatorJob, IndicatorResult } from './indicatorJob';

import { dailyIndicatorJobs } from './daily/indicatorRegistry';
import { quarterlyIndicatorJobs } from './quarterly/indicatorRegistry';
import type { IndicatorJob } from './indicatorJob';

export const indicatorJobs: IndicatorJob[] = [...dailyIndicatorJobs, ...quarterlyIndicatorJobs];
