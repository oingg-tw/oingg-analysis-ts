import type { PeriodType, LookbackRange, SamplingInterval, SnapshotCadence } from './metricBasis';

// 2026-09-17 clean architecture 重構 Phase 1：從 application/metrics/metricValueWriter.ts 抽出
// 「座標」相關的純型別跟 helper——writer 本身要碰 Prisma，但座標的形狀跟「四個 basis 欄位
// 其中一組是真實值、其餘 'N/A'」這個結構規則是純 domain 知識，domain/metrics/timeframe.ts
// 的 timeframe 解析也要用，不能反過來 import writer。writer 仍 re-export 這些名稱，既有
// ~150 個 compute*Pit.ts 呼叫點不用改。

export interface MetricValueCoordinate {
  symbol: string;
  metricCode: string;
  // 任何一筆座標只會有其中「一組」是真實值，其餘固定 'N/A'：periodType 單獨一組
  // （季報型指標，寫進 metric_values）；lookbackRange+samplingInterval 成對一組 /
  // snapshotCadence 單獨一組（逐日型指標，寫進 metric_daily_cadence_values）——
  // 完整說明見 metricBasis.ts。哪一組是真實值決定這筆資料寫進哪張表，呼叫端不用
  // 知道這件事，writeMetricValue() 內部處理。
  periodType: PeriodType;
  lookbackRange: LookbackRange;
  samplingInterval: SamplingInterval;
  snapshotCadence: SnapshotCadence;
  // 2026-09-09：fiscalYear/fiscalQuarter 拆表後只有季報型（periodType 這組）才需要，
  // 改成 optional——writeMetricValue() 判斷走季報型路徑時才要求必填（執行期驗證），
  // 逐日型路徑完全不使用這兩個欄位。
  fiscalYear?: number;
  fiscalQuarter?: number;
  // 2026-09-23：月頻（group='monthly'，寫進 metric_monthly_values）用 fiscalYear + fiscalMonth。
  // 四個 basis 欄位對它全部是 'N/A'——月頻的座標不屬於任何一組既有 basis。fiscalYear 跟季報型共用同一個欄位。
  fiscalMonth?: number;
  // tradeDate：拆表後只有逐日型（lookbackRange/snapshotCadence 這兩組）才需要，是
  // metric_daily_cadence_values 的真正自然鍵（NOT NULL）——writeMetricValue() 判斷
  // 走逐日型路徑時執行期驗證必填。季報型路徑完全不使用這個欄位。
  tradeDate?: Date | null;
  dataType: string;
  subsidiaryCompanyId: string;
}

export type BasisGroupFields = Pick<MetricValueCoordinate, 'periodType' | 'lookbackRange' | 'samplingInterval' | 'snapshotCadence'>;

// 四個 basis 相關欄位的「其中一組是真實值，其餘固定 'N/A'」這個結構性規則，每個
// writeMetricValue 呼叫點都要遵守——~150 個呼叫點如果各自手寫四個欄位太囉唆也容易漏改，
// 這三個 helper 各自對應一組語意，呼叫端 `...periodTypeGroup('TTM')` 展開成完整的四欄位
// 組合，只需要記得自己這組要填哪個真實值。
export const periodTypeGroup = (periodType: PeriodType): BasisGroupFields => ({
  periodType,
  lookbackRange: 'N/A',
  samplingInterval: 'N/A',
  snapshotCadence: 'N/A',
});

// 2026-09-23 月頻：四個 basis 欄位全部 'N/A'，座標由 fiscalYear + fiscalMonth 表達。
export const monthlyGroup = (): BasisGroupFields => ({
  periodType: 'N/A',
  lookbackRange: 'N/A',
  samplingInterval: 'N/A',
  snapshotCadence: 'N/A',
});

export const rollingWindowGroup = (lookbackRange: LookbackRange, samplingInterval: SamplingInterval): BasisGroupFields => ({
  periodType: 'N/A',
  lookbackRange,
  samplingInterval,
  snapshotCadence: 'N/A',
});

export const snapshotCadenceGroup = (snapshotCadence: SnapshotCadence): BasisGroupFields => ({
  periodType: 'N/A',
  lookbackRange: 'N/A',
  samplingInterval: 'N/A',
  snapshotCadence,
});

export type MetricValueWriteOutcome =
  | { action: 'inserted' }
  | { action: 'updated_same_knowledge_date' } // 同一天重跑，非新資訊，就地覆蓋而非疊列
  | { action: 'skipped_unchanged' } // spec v0.2 §5.2：值沒變就不寫
  | { action: 'rejected'; reason: string }; // spec v0.2 §5.5：欄位組合不在 allowed* 內 / metricCode 未註冊 / 結構不變式違反
