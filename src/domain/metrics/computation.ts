import type { MetricNullReason, PeriodType } from './metricBasis';
import { periodTypeGroup, type MetricValueCoordinate } from './coordinate';

// 2026-09-17 clean architecture 重構 Phase 3：「算」跟「寫」分離的資料形狀。
//
// 舊架構的 computeAndWriteXxxPit 算完直接呼叫 writeMetricValue，值不回傳、只回傳寫入結果
// （inserted/skipped_unchanged…），所以不連資料庫就沒辦法對值做單元測試。新架構的 computeXxx
// 回傳 ComputationBatch：每個 basis 一個「槽」（slot），槽裡不是一筆準備寫入的完整資料
// （MetricComputation，= 舊 writeMetricValue 的輸入形狀，一個欄位都沒改），就是一個 skip
// （舊架構裡各 compute 自己回傳的 skipped_no_quarter 之類）。application/metrics/
// persistComputations.ts 再逐槽寫入，回傳形狀跟舊的 outcome 完全一樣。
//
// slots 的 key 就是舊 outcome 的欄位名（'q'/'ttm'/'fy'、family 的 'grossMarginQ'…）：寫入結果
// 攤平後 `{ symbol, rocYear, season, ...outcomes }` 逐 byte 等於舊的回傳值，scripts/ 跟
// verifyMetricEquivalencePit 不用改。物件的插入順序 = 寫入順序（跟舊架構逐一 await 的順序一致）。

export interface MetricComputation extends MetricValueCoordinate {
  value: number | null;
  nullReason: MetricNullReason | null;
  knowledgeDate: Date;
  knowledgeDateIsFallback: boolean;
  formulaVersion?: number; // 預設 1
}

// 三種「這個 basis 這次不寫」的原因，跟舊架構各 compute 手寫的字面值一一對應。
export type ComputationSkip = { action: 'skipped_no_knowledge_date' } | { action: 'skipped_no_quarter' } | { action: 'skipped_no_trade_date' };

export type ComputationSlot = MetricComputation | ComputationSkip;

export const isComputationSkip = (slot: ComputationSlot): slot is ComputationSkip => 'action' in slot;

// 季報型指標的一批計算結果；逐日型指標（beta/marketRatios/live*）遷移時另外定義帶 tradeDate 的形狀。
export interface ComputationBatch<K extends string> {
  symbol: string;
  rocYear: string | null;
  season: string | null;
  slots: Record<K, ComputationSlot>;
}

// knowledge_date 解析結果裡 slot 用得到的兩個欄位（application/metrics/knowledgeDate.ts 的
// KnowledgeDateResolution 是它的超集）。
export interface KnowledgeAnchor {
  knowledgeDate: Date;
  isFallback: boolean;
}

export type CoordinateBase = Omit<MetricValueCoordinate, 'periodType' | 'lookbackRange' | 'samplingInterval' | 'snapshotCadence'>;

// 舊 writeOrSkip 的純函式版：anchor 不存在就 skip，存在才組成一筆完整的 MetricComputation。
export const periodSlot = (
  anchor: KnowledgeAnchor | null,
  coordinateBase: CoordinateBase,
  period: PeriodType,
  value: number | null,
  nullReason: MetricNullReason | null
): ComputationSlot => {
  if (!anchor) return { action: 'skipped_no_knowledge_date' };
  return {
    ...coordinateBase,
    ...periodTypeGroup(period),
    value,
    nullReason,
    knowledgeDate: anchor.knowledgeDate,
    knowledgeDateIsFallback: anchor.isFallback,
  };
};

// 解析不到任何一季（公司查無財報）時的整批 skip——舊架構每支 compute 各自手寫
// `{ symbol, rocYear: null, season: null, q: { action: 'skipped_no_quarter' }, ttm: {...} }`。
export const noQuarterBatch = <K extends string>(symbol: string, keys: readonly K[]): ComputationBatch<K> => ({
  symbol,
  rocYear: null,
  season: null,
  slots: Object.fromEntries(keys.map((key) => [key, { action: 'skipped_no_quarter' }])) as Record<K, ComputationSlot>,
});
