// 2026-09-05 起這裡只是薄殼合併層——「單一公司、有 calculate* 函式」指標分別登記在
// ./daily/indicatorRegistry.ts（依賴每日股價/市場行情）跟 ./quarterly/indicatorRegistry.ts
// （依賴季度財報），兩份彼此獨立、依 getCompanyIds 的公司清單來源分組，不是憑感覺分（見
// 各自檔案開頭的說明）。2026-09-08 起兩份都是空陣列——舊架構「單一指標一張表」的 model
// 已經全部退場（見各自檔案開頭的說明），indicatorJobs 目前沒有任何登記中的 job，
// compute-on-miss 完全不會觸發任何重算。
//
// 這裡合併回單一 indicatorJobs 清單，唯一的用途是給
// scripts/batchComputeIndicators.ts（CLI 手動觸發，維持一次跑全部的行為）用的清單——
// 2026-09-08 起 api/bff 的 compute-on-miss 讀取路徑（原 metricsService.ts）已隨
// filterCatalog/screener 整套機制一起退場，不再有 API 端點消費這份清單。
// `macro/equityRiskPremium`（全市場單一值，沒有 symbol）跟 `valuation/ranking`（本身是
// 跨公司排行端點）不適用「單一公司」這個模式，兩份 registry 都沒有列進來。

import { dailyIndicatorJobs } from './daily/indicatorRegistry';
import { quarterlyIndicatorJobs } from './quarterly/indicatorRegistry';
import type { IndicatorJob } from './indicatorJob';

export const indicatorJobs: IndicatorJob[] = [...dailyIndicatorJobs, ...quarterlyIndicatorJobs];
