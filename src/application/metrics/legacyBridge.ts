import { pitDeps } from '@/bootstrap/pitDeps';
import type { PitDeps } from './deps';

// **暫時性**檔案：全 src/application 唯一一個 import bootstrap 的地方（dependency-cruiser 的
// application-only-domain 已知違規）。Phase 3 收尾後只剩兩個使用者——shared/provenance/provenanceResolvers.ts
// 的綁定 map 跟 GET /companies/piotroski-breakdown 的 controller——它們在 Phase 4 改收 bootstrap 綁定好的
// use case 後，這支檔案刪除。scripts/ 跟整合測試請走 src/bootstrap/pitMetrics.ts，不要 import 這裡。
export const legacyPitDeps: PitDeps = pitDeps;
