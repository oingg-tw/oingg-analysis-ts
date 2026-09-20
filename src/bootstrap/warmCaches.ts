import { loadIndustryCodes } from '@/infrastructure/repositories/exchange/industryCodes';
import { loadIndustryClassification } from '@/infrastructure/repositories/gov/industryClassification';

// 啟動時要載進記憶體的兩個輔助性快取，集中在一處——每一個 loadXxx 都自己吞掉失敗只記 log
// （失敗只影響對應的那幾支端點，不擋伺服器啟動），所以這裡用 allSettled 不會有 reject。
// 抽出前 src/index.ts 是各自不 await；index.ts 現在 `void warmCaches()` 行為等價。
// Phase 4 會改成在 listen 之前 await（消除冷快取窗口），見計畫 B2。
// 2026-09-20 使用者要求完全捨棄 playwright-py 供應鏈分類，原本這裡的三個 loadXxx
// （loadIndustryChainClassification/loadIndustryClusters/loadIndustryTree）已移除。
export const warmCaches = (): Promise<PromiseSettledResult<void>[]> =>
  Promise.allSettled([
    // 產業代碼對照表（models/industryCodes.ts）。
    loadIndustryCodes(),
    // gov-ts 產業分類（產業樹狀瀏覽 GET /industries/tree、/industries/flat）。
    loadIndustryClassification(),
  ]);
