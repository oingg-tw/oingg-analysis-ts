import { metricDefinitionRegistry } from '@/pitMetrics/metricDefinitionRegistry';
import { periodTypeGroup, rollingWindowGroup, snapshotCadenceGroup } from '@/pitMetrics/metricValueWriter';
import type { PeriodType, LookbackRange, SamplingInterval, SnapshotCadence } from '@/pitMetrics/metricBasis';

// 2026-09-08 重建：舊架構 screener 的 field 格式是 "metricKey.fieldKey"（fieldKey 對應
// 某個舊架構表的欄位名稱，例如 "roe.roeQuarterlyPct"），靠 metricTableRegistry.ts 解析成
// 「哪張表、哪個欄位」——那套解析機制只認得「一指標一表」的舊架構，已經隨同無真實依賴的
// filterCatalog 一起刪除（見 abstract-crafting-journal.md）。pitMetrics 全部指標共用同一張
// metric_values 表，沒有「表/欄位」這個維度，取而代之的是四個 basis 相關欄位（見
// metricBasis.ts 的完整說明）——新格式改成 "metricCode.token"：
//   - 季報型指標（periodType 這組）：token 是 Q/YTD/TTM/Q_ANN/FY 其中之一，例如 "roe.TTM"。
//   - Beta 這類滾動統計量（lookbackRange+samplingInterval 這組）：token 是
//     "<lookbackRange>_<samplingInterval>"，例如 "beta.2Y_1W"。
//   - 純市場快照（snapshotCadence 這組）：token 是 EOD，例如 "exchangePeRatio.EOD"。
// 呼叫端不需要知道自己在問哪一組——每個 metricCode 在 metricDefinitionRegistry 裡只會
// 落在其中一組，這裡依 metricCode 自動判斷該用哪一組的解析規則，token 格式錯誤或不在
// 允許清單內都會拒絕。可用的 metricCode/token 組合見 GET /filters。

export class ScreenerValidationError extends Error {}

export interface FieldRef {
  field: string; // 原始請求字串（"metricCode.token"），拿來當回應 values 的 key
  metricCode: string;
  periodType: PeriodType;
  lookbackRange: LookbackRange;
  samplingInterval: SamplingInterval;
  snapshotCadence: SnapshotCadence;
}

const isRealGroup = (values: string[]): boolean => values.length > 0 && !(values.length === 1 && values[0] === 'N/A');

// 抽出來給 companies/controller.ts 的泛化 metric-history/metrics-history 端點共用——那兩支
// 端點的 query 已經有獨立的 metricCode 參數，不需要再解析 "metricCode.token" 這種複合字串，
// 只需要「給定 metricCode，這個 token 屬於四組裡的哪一組、合不合法」這一段判斷邏輯，
// 所以拆成這支不含「.」切割的版本，resolveFieldOrThrow 內部也改呼叫它，避免兩處各自維護
// 一份幾乎一樣的四組判斷邏輯。
export const resolveTokenForMetric = (metricCode: string, token: string, displayField: string): FieldRef => {
  const definition = metricDefinitionRegistry[metricCode];
  if (!definition) {
    throw new ScreenerValidationError(`"${displayField}" 不是可查詢的欄位——"${metricCode}" 不是已註冊的 metricCode，見 GET /filters 確認可用清單。`);
  }

  if (isRealGroup(definition.allowedPeriodTypes)) {
    if (!definition.allowedPeriodTypes.includes(token as PeriodType)) {
      throw new ScreenerValidationError(`"${displayField}" 不是可查詢的欄位——metricCode "${metricCode}" 不支援 periodType "${token}"，允許的值：${definition.allowedPeriodTypes.join(', ')}。`);
    }
    return { field: displayField, metricCode, ...periodTypeGroup(token as PeriodType) };
  }

  if (isRealGroup(definition.allowedLookbackRanges)) {
    const [lookbackRange, samplingInterval] = token.split('_');
    if (!lookbackRange || !samplingInterval || !definition.allowedLookbackRanges.includes(lookbackRange as LookbackRange) || !definition.allowedSamplingIntervals.includes(samplingInterval as SamplingInterval)) {
      throw new ScreenerValidationError(
        `"${displayField}" 不是可查詢的欄位——metricCode "${metricCode}" 的 token 要是 "<lookbackRange>_<samplingInterval>" 格式，允許的 lookbackRange：${definition.allowedLookbackRanges.join(', ')}，允許的 samplingInterval：${definition.allowedSamplingIntervals.join(', ')}。`,
      );
    }
    return { field: displayField, metricCode, ...rollingWindowGroup(lookbackRange as LookbackRange, samplingInterval as SamplingInterval) };
  }

  if (isRealGroup(definition.allowedSnapshotCadences)) {
    if (!definition.allowedSnapshotCadences.includes(token as SnapshotCadence)) {
      throw new ScreenerValidationError(`"${displayField}" 不是可查詢的欄位——metricCode "${metricCode}" 不支援 snapshotCadence "${token}"，允許的值：${definition.allowedSnapshotCadences.join(', ')}。`);
    }
    return { field: displayField, metricCode, ...snapshotCadenceGroup(token as SnapshotCadence) };
  }

  throw new ScreenerValidationError(`"${displayField}" 不是可查詢的欄位——metricCode "${metricCode}" 在 metricDefinitionRegistry 裡沒有宣告任何允許的 basis 組合，這是註冊資料本身的問題。`);
};

export const resolveFieldOrThrow = (field: string): FieldRef => {
  const firstDot = field.indexOf('.');
  if (firstDot === -1) {
    throw new ScreenerValidationError(`"${field}" 格式錯誤，field 要是 "metricCode.token" 這種格式（例如 "roe.TTM"），可用的 metricCode/token 組合見 GET /filters。`);
  }
  const metricCode = field.slice(0, firstDot);
  const token = field.slice(firstDot + 1);
  if (!metricCode || !token) {
    throw new ScreenerValidationError(`"${field}" 格式錯誤，field 要是 "metricCode.token" 這種格式（例如 "roe.TTM"），可用的 metricCode/token 組合見 GET /filters。`);
  }

  return resolveTokenForMetric(metricCode, token, field);
};
