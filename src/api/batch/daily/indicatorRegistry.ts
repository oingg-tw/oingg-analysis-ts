// 依賴每日股價/市場行情的指標登錄檔——2026-09-05 從 api/batch/indicatorRegistry.ts
// 拆出來（原本的合併清單見 ../indicatorRegistry.ts），給 POST /batch/compute/daily 用。
// 這些資料每天更新，跟 ../quarterly/（依賴季度財報，一季才變一次）刻意分開，確保每天觸發
// 不會跟股價脫節。
//
// 2026-09-08 起清空：原本登記的 marketRatios/beta 兩支（domainMetrics/marketRatios.ts、
// domainMetrics/beta.ts）已經整批退場——這兩支指標已經獨立遷入 pitMetrics
// （exchangePeRatio/exchangePbRatio/dividendYield/beta，見
// src/domainPitMetrics/shared/marketRatios/、src/domainPitMetrics/valuation/beta/），
// filterCatalog.csv 最後 6 列確認是開發環境假資料誤判、沒有真實功能依賴（跟 bff-ts
// 多輪確認過），GET /stocks/:symbol/quote 也已經改讀 pitMetrics 版本，見
// src/api/bff/stocks/service.ts 的 getStockQuote。
//
// 刻意不刪除這支檔案跟 ../../batch/daily/ 整套批次基礎設施（controller/route/openapi/
// runner 串接）——只是變成「目前沒有任何 job 可跑」的空陣列，跟
// src/api/batch/quarterly/indicatorRegistry.ts 2026-09-07 那次同樣的處理方式一致，
// POST /batch/compute/daily 呼叫了也不會出錯，只是空跑；之後如果要新增新的逐日型
// 批次指標，這個空殼可以直接復用，不用重建。

import type { IndicatorJob } from '../indicatorJob';

export const dailyIndicatorJobs: IndicatorJob[] = [];
