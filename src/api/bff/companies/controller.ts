// 2026-09-13：這個檔案原本是 764 行、混雜 16 支彼此無關端點的巨石檔案，最大單一貢獻源是
// 40 支稽核鏈 resolver 的 import + dispatch table（只服務 metric-provenance 這一支端點，
// 而且每次擴大稽核鏈試點範圍都會繼續變胖）。拆成依資源分群的獨立檔案後，這裡改成純
// re-export 的 barrel——route.ts/openapi.ts 全部是 `import { X } from './controller'`
// 具名匯入，用 barrel 模式讓那兩支檔案完全不用改一行，拆分風險侷限在這個資料夾內部。
export * from './companyDirectoryController';
export * from './companyMetricHistoryController';
export * from './companyFinancialStatementController';
export * from './companyPeerGroupController';
export * from './companyPiotroskiController';
export * from './companyProvenanceController';
export * from './companyBadgesController';
export * from './companyCompletenessController';
