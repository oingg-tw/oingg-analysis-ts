import { prismaMetricValueRepository } from '@/infrastructure/repositories/analysis/metricValueRepository';
import { metricDefinitionRegistry } from './metricDefinitionRegistry';
import type { PeriodType, MetricNullReason } from '../../domain/metrics/metricBasis';
import { periodTypeGroup, rollingWindowGroup, snapshotCadenceGroup, type MetricValueCoordinate, type MetricValueWriteOutcome } from '@/domain/metrics/coordinate';
import type { MetricComputation } from '@/domain/metrics/computation';
import type { KnowledgeDateResolution } from './knowledgeDate';
import type { BasisOutcome } from './pitOutcome';
import { persistOne } from './persistComputations';

// 2026-09-17 clean architecture 重構 Phase 1：座標型別、三個 basis group helper、
// MetricValueWriteOutcome 搬到 domain/metrics/coordinate.ts（純 domain 知識，timeframe
// 解析也要用，不能反過來依賴這支會碰 Prisma 的 writer）；這裡 re-export 讓 ~150 個既有
// 呼叫點不用改 import。
export { periodTypeGroup, rollingWindowGroup, snapshotCadenceGroup };
export type { MetricValueCoordinate, MetricValueWriteOutcome };

// Phase 3：寫入的本體（座標驗證、既有列比對、原子 upsert）搬到 persistComputations.ts 並改成
// 注入 repository；這支檔案只剩遷移期間給還沒遷移的 compute*Pit.ts 用的薄包裝，綁定真實的
// Prisma repository 跟靜態 registry。全部 family 遷完後整支刪除。
export type MetricValueInput = MetricComputation;

const legacyPersistDeps = {
  metricValues: prismaMetricValueRepository,
  definitions: { get: (metricCode: string) => metricDefinitionRegistry[metricCode] },
};

export const writeMetricValue = (input: MetricValueInput): Promise<MetricValueWriteOutcome> => persistOne(input, legacyPersistDeps);

// 2026-09-13：季報型指標寫入路徑的最後一段幾乎全部長這樣——「anchor（knowledgeDate 解析
// 結果）不存在就整個 skip，存在才呼叫 writeMetricValue()」，在近百支 compute*Pit.ts 裡
// 各自重複同一段 if/else 樣板（唯一的差異是 periodType/value/nullReason 三個值）。
// 統一抽出來，呼叫端只需要傳這三個會變動的值。（純函式版是 domain/metrics/computation.ts 的 periodSlot。）
export const writeOrSkip = async (
  anchor: KnowledgeDateResolution | null,
  coordinateBase: Omit<MetricValueCoordinate, 'periodType' | 'lookbackRange' | 'samplingInterval' | 'snapshotCadence'>,
  period: PeriodType,
  value: number | null,
  nullReason: MetricNullReason | null
): Promise<BasisOutcome> => {
  if (!anchor) return { action: 'skipped_no_knowledge_date' };
  return writeMetricValue({
    ...coordinateBase,
    ...periodTypeGroup(period),
    value,
    nullReason,
    knowledgeDate: anchor.knowledgeDate,
    knowledgeDateIsFallback: anchor.isFallback,
  });
};
