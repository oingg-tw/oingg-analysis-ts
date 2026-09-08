import { metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import type { MetricBasis } from '@/pitMetrics/metricBasis';

// 2026-09-08 重建：舊架構 screener 的 field 格式是 "metricKey.fieldKey"（fieldKey 對應
// 某個舊架構表的欄位名稱，例如 "roe.roeQuarterlyPct"），靠 metricTableRegistry.ts 解析成
// 「哪張表、哪個欄位」——那套解析機制只認得「一指標一表」的舊架構，已經隨同無真實依賴的
// filterCatalog 一起刪除（見 abstract-crafting-journal.md）。pitMetrics 全部指標共用同一張
// metric_values 表，沒有「表/欄位」這個維度，取而代之的正交維度是 basis（Q/Q_ANN/TTM/...）
// ——新格式改成 "metricCode.basis"，例如 "roe.TTM"，直接對應
// GET /filters（metricFolderCatalog.ts）回傳的 metricCode/allowedBases。

export class ScreenerValidationError extends Error {}

export interface FieldRef {
  field: string; // 原始請求字串（"metricCode.basis"），拿來當回應 values 的 key
  metricCode: string;
  basis: MetricBasis;
}

export const resolveFieldOrThrow = (field: string): FieldRef => {
  const [metricCode, basis] = field.split('.');
  if (!metricCode || !basis) {
    throw new ScreenerValidationError(`"${field}" 格式錯誤，field 要是 "metricCode.basis" 這種格式（例如 "roe.TTM"），可用的 metricCode/basis 組合見 GET /filters。`);
  }
  const definition = metricDefinitionRegistry[metricCode];
  if (!definition) {
    throw new ScreenerValidationError(`"${field}" 不是可查詢的欄位——"${metricCode}" 不是已註冊的 metricCode，見 GET /filters 確認可用清單。`);
  }
  if (!definition.allowedBases.includes(basis as MetricBasis)) {
    throw new ScreenerValidationError(`"${field}" 不是可查詢的欄位——metricCode "${metricCode}" 不支援 basis "${basis}"，允許的值：${definition.allowedBases.join(', ')}。`);
  }
  return { field, metricCode, basis: basis as MetricBasis };
};
