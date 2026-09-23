import { ValidationError } from '@/application/errors';
import { resolveTimeframe, validTimeframes, type FieldRef } from '@/domain/metrics/timeframe';
import { metricDefinitionRegistry } from './metricDefinitionRegistry';

export type { FieldRef };

// 2026-09-17 clean architecture 重構 Phase 1：從 http/modules/screener/fieldResolver.ts 搬到
// application——查 registry + 丟 ValidationError 是 use case 層的事，純解析規則在
// domain/metrics/timeframe.ts。fieldResolver.ts 現在只剩「把 "metricCode.timeframe" 字串切開」
// 這一段 HTTP 輸入格式的處理，並 re-export 這裡的函式給既有呼叫端。
//
// 錯誤訊息是對外契約（bff-ts 直接顯示 400 的 message），搬家時逐字保留。

// 這支 metricCode 實際可用的 timeframe 清單——GET /metrics（metricFolderCatalog.ts）的
// validTimeframes 欄位用，呼叫端直接拿來當選單，不用自己拿 allowedLookbackRanges x
// allowedSamplingIntervals 做笛卡兒積（beta 9 種組合只有 3 種真的有資料）。
export const validTimeframesForMetric = (metricCode: string): string[] => {
  const definition = metricDefinitionRegistry[metricCode];
  return definition ? validTimeframes(definition) : [];
};

// 給定 metricCode，判斷這個 timeframe 屬於四組裡的哪一組、合不合法；不合法丟 ValidationError。
// companies 的 metric-history/metrics-history 端點（query 已經有獨立的 metricCode 參數）直接
// 用這支，screener 的 resolveFieldOrThrow 先切 "." 再呼叫這支，四組判斷邏輯只維護一份。
export const resolveTimeframeForMetric = (metricCode: string, timeframe: string, displayField: string): FieldRef => {
  const definition = metricDefinitionRegistry[metricCode];
  if (!definition) {
    throw new ValidationError(`"${displayField}" 不是可查詢的欄位——"${metricCode}" 不是已註冊的 metricCode，見 GET /metrics 確認可用清單。`);
  }

  const ref = resolveTimeframe(definition, timeframe, displayField);
  if (ref) return ref;

  const allowed = validTimeframes(definition).join(', ');
  switch (definition.group) {
    case 'period':
      throw new ValidationError(`"${displayField}" 不是可查詢的欄位——metricCode "${metricCode}" 不支援 periodType "${timeframe}"，允許的值：${allowed}。`);
    case 'rollingWindow':
      // 2026-09-08 bff-ts 實測回報：allowedLookbackRanges x allowedSamplingIntervals 不是
      // 自由交叉組合（beta 3x3=9 種裡只有 3 種真的有資料）——訊息直接列出唯一合法的組合清單。
      throw new ValidationError(
        `"${displayField}" 不是可查詢的欄位——metricCode "${metricCode}" 的 timeframe 要是 "<lookbackRange>_<samplingInterval>" 格式，且必須是下列已知有資料的組合之一（不是 lookbackRange/samplingInterval 的自由交叉組合）：${allowed}。`,
      );
    case 'snapshot':
      throw new ValidationError(`"${displayField}" 不是可查詢的欄位——metricCode "${metricCode}" 不支援 snapshotCadence "${timeframe}"，允許的值：${allowed}。`);
    case 'monthly':
      throw new ValidationError(`"${displayField}" 不是可查詢的欄位——metricCode "${metricCode}" 是月頻指標，timeframe 只有 "M" 一種（收到 "${timeframe}"）。`);
  }
};
