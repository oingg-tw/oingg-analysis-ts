// 民國年 -> 西元年——新架構（metric_values）的邊界層工具，獨立於 src/shared/rocQuarter.ts
// （那支是現有 36 支指標共用的檔案，這次 ROE spike 不異動）。只在寫入 metric_values 前
// 使用，不滲透進 QuarterlyMetricQuery 或現有 36 支指標——它們的 year 繼續是民國年字串。
export const rocYearToGregorian = (rocYear: number): number => rocYear + 1911;
