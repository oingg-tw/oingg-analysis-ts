import type { MetricValueWriteOutcome } from './metricValueWriter';

// 87 支 compute*Pit.ts 的回傳型別（XxxPitOutcome）幾乎都是同一個形狀：symbol/rocYear/
// season 三個座標欄位 + 一組 basis 結果（q/qAnn/ttm/fy 任意子集，每個 metric 只用到
// 其中幾個），2026-09-13 抽出共用。q/qAnn/ttm/fy 故意都是選填——每支指標只回傳自己實際
// 算的那幾個 basis，不是每個 basis 都適用於每支指標（例如 flow/flow 比率沒有 Q_ANN、
// 年度型指標只有 fy）。
export type BasisOutcome = MetricValueWriteOutcome | { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' };

export interface QuarterlyPitOutcomeBase {
  symbol: string;
  rocYear: string | null;
  season: string | null;
}

// 只用到 q/qAnn/ttm/fy 這組通用命名的指標直接用這個型別（例如
// `export type RoaPitOutcome = StandardBasisPitOutcome;`），不用各自宣告一份幾乎相同的
// interface。用多個 metric_code 拆出自訂欄位名稱的家族檔案（turnoverRatio/margins/
// dupont 等）欄位名稱本來就跟 basis 概念脫鉤，不適用這個型別，繼續各自宣告 interface，
// 但仍可 extend QuarterlyPitOutcomeBase 拿掉 symbol/rocYear/season 三行重複。
export interface StandardBasisPitOutcome extends QuarterlyPitOutcomeBase {
  q?: BasisOutcome;
  qAnn?: BasisOutcome;
  ttm?: BasisOutcome;
  fy?: BasisOutcome;
}
