import { loadIndustryCodes } from '@/infrastructure/repositories/exchange/industryCodes';
import { loadIndustryClassification } from '@/infrastructure/repositories/gov/industryClassification';
import { loadIndustryChainClassification } from '@/infrastructure/repositories/playwright/industryChainClassification';
import { loadIndustryClusters } from '@/infrastructure/repositories/playwright/industryClusters';
import { loadIndustryTree } from '@/infrastructure/repositories/playwright/industryTree';

// 啟動時要載進記憶體的五個輔助性快取，集中在一處——每一個 loadXxx 都自己吞掉失敗只記 log
// （失敗只影響對應的那幾支端點，不擋伺服器啟動），所以這裡用 allSettled 不會有 reject。
// 抽出前 src/index.ts 是五個 `void loadXxx()` 各自不 await；index.ts 現在 `void warmCaches()`
// 行為等價。HTTP 契約測試對依賴快取的端點（peer-group/chain-tree…）會先 await 這支再打。
// Phase 4 會改成在 listen 之前 await（消除冷快取窗口），見計畫 B2。
export const warmCaches = (): Promise<PromiseSettledResult<void>[]> =>
  Promise.allSettled([
    // 產業代碼對照表（models/industryCodes.ts）。
    loadIndustryCodes(),
    // gov-ts 產業分類（產業樹狀瀏覽 GET /industries/tree、/industries/flat）。
    loadIndustryClassification(),
    // playwright-py 供應鏈分類（GET /industries/chain-classification、同業標籤）。
    loadIndustryChainClassification(),
    // playwright-py 供應鏈聚落（GET /industries/chain-clusters，cluster_id 不穩定，見該檔說明）。
    loadIndustryClusters(),
    // playwright-py 產業追蹤瀏覽樹（GET /industries/chain-tree、GET /companies/peer-group）。
    loadIndustryTree(),
  ]);
