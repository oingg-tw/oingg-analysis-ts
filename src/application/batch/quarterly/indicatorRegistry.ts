// 依賴 mops 季度財報的指標登錄檔——2026-09-05 從 api/batch/indicatorRegistry.ts 拆出來
// （原本的合併清單見 ../indicatorRegistry.ts），給 POST /batch/compute/quarterly 用。
// 一家公司一季頂多變一次，跟 ../daily/（依賴每日股價/市場行情）刻意分開，避免每天對財報
// 資料白算一次。
//
// 2026-09-07：原本登記在這裡的 34 支舊架構指標（profitability/cashFlow/resilience/
// turnover/guru/valuation 六個分類）已經全部有 pitMetrics 版本可查（見
// GET /companies/metric-history），使用者要求把舊架構（domainMetrics/*.ts + 各自一張
// Result 表）整批刪除，這份清單因此變成空陣列。**刻意保留這個檔案跟 quarterly/ 整套批次
// 基礎設施**（controller/route/openapi/runner）——`POST /batch/compute/quarterly` 呼叫
// 了不會出錯，只是空跑；之後如果要新增新的季度型批次指標，這個空殼可以直接復用，不用重建。

import type { IndicatorJob } from '../indicatorJob';

export const quarterlyIndicatorJobs: IndicatorJob[] = [];
