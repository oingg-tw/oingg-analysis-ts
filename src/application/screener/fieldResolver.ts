import { ValidationError } from '@/application/errors';
import { resolveTimeframeForMetric, type FieldRef } from '@/application/metrics/resolveTimeframeForMetric';

export type { FieldRef };

// 2026-09-08 重建：舊架構 screener 的 field 格式是 "metricKey.fieldKey"（fieldKey 對應
// 某個舊架構表的欄位名稱，例如 "roe.roeQuarterlyPct"），靠 metricTableRegistry.ts 解析成
// 「哪張表、哪個欄位」——那套解析機制只認得「一指標一表」的舊架構，已經隨同無真實依賴的
// filterCatalog 一起刪除（見 abstract-crafting-journal.md）。pitMetrics 全部指標共用同一張
// metric_values 表，沒有「表/欄位」這個維度，取而代之的是四個 basis 相關欄位（見
// metricBasis.ts 的完整說明）——新格式改成 "metricCode.timeframe"：
//   - 季報型指標（periodType 這組）：timeframe 是 Q/YTD/TTM/FY 其中之一，例如 "roe.TTM"。
//   - Beta 這類滾動統計量（lookbackRange+samplingInterval 這組）：timeframe 是
//     "<lookbackRange>_<samplingInterval>"，例如 "beta.2Y_1W"。
//   - 純市場快照（snapshotCadence 這組）：timeframe 是 EOD，例如 "exchangePeRatio.EOD"。
// 呼叫端不需要知道自己在問哪一組——每個 metricCode 在 metricDefinitionRegistry 裡只會
// 落在其中一組，依 metricCode 自動判斷該用哪一組的解析規則，timeframe 格式錯誤或不在
// 允許清單內都會拒絕。可用的 metricCode/timeframe 組合見 GET /metrics。
//
// 2026-09-17 clean architecture 重構：timeframe 的解析規則在 domain/metrics/timeframe.ts（純函式）+
// application/metrics/resolveTimeframeForMetric.ts（查 registry、丟 ValidationError），這裡只剩
// 「把 "metricCode.timeframe" 字串切開」；Phase 4 從 http/modules/screener/fieldResolver.ts 搬到
// application。錯誤訊息是對外契約（bff-ts 直接顯示 400 的 message），逐字保留。
export const resolveFieldOrThrow = (field: string): FieldRef => {
  const firstDot = field.indexOf('.');
  if (firstDot === -1) {
    throw new ValidationError(`"${field}" 格式錯誤，field 要是 "metricCode.timeframe" 這種格式（例如 "roe.TTM"），可用的 metricCode/timeframe 組合見 GET /metrics。`);
  }
  const metricCode = field.slice(0, firstDot);
  const timeframe = field.slice(firstDot + 1);
  if (!metricCode || !timeframe) {
    throw new ValidationError(`"${field}" 格式錯誤，field 要是 "metricCode.timeframe" 這種格式（例如 "roe.TTM"），可用的 metricCode/timeframe 組合見 GET /metrics。`);
  }

  return resolveTimeframeForMetric(metricCode, timeframe, field);
};
