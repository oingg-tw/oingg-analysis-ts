import {
  findLatestPeriodMetricRow,
  upsertPeriodMetricRow,
  findLatestDailyCadenceMetricRow,
  upsertDailyCadenceMetricRow,
} from '@/infrastructure/repositories/analysis/metricValueRepository';
import { metricDefinitionRegistry } from './metricDefinitionRegistry';
import type { PeriodType, MetricNullReason } from '../../domain/metrics/metricBasis';
import { periodTypeGroup, rollingWindowGroup, snapshotCadenceGroup, type MetricValueCoordinate, type MetricValueWriteOutcome } from '@/domain/metrics/coordinate';
import type { KnowledgeDateResolution } from './knowledgeDate';
import type { BasisOutcome } from './pitOutcome';

// 2026-09-17 clean architecture 重構 Phase 1：座標型別、三個 basis group helper、
// MetricValueWriteOutcome 搬到 domain/metrics/coordinate.ts（純 domain 知識，timeframe
// 解析也要用，不能反過來依賴這支會碰 Prisma 的 writer）；這裡 re-export 讓 ~150 個既有
// 呼叫點不用改 import。
export { periodTypeGroup, rollingWindowGroup, snapshotCadenceGroup };
export type { MetricValueCoordinate, MetricValueWriteOutcome };

export interface MetricValueInput extends MetricValueCoordinate {
  value: number | null;
  nullReason: MetricNullReason | null;
  knowledgeDate: Date;
  knowledgeDateIsFallback: boolean;
  formulaVersion?: number; // 預設 1
}

const periodTypeIsSet = (periodType: PeriodType): boolean => periodType !== 'N/A';

// 2026-09-17 改成相對容差：原本固定 `< 1e-9` 的絕對容差對市值這種 1e12 等級的數字根本
// 不可能成立——float64 在 1e12 的精度只有 ~1e-4，price × shares 算出來的浮點雜訊永遠比
// 1e-9 大，導致 2317 marketCap 114Q1 這一列每次重跑都被判「值變了」、寫回去的卻是同一個
// 數字（DB 欄位的 scale 把雜訊截掉了），白白 upsert 一次、shadow 表也跟著累積一筆垃圾，
// 更讓「重跑全部 skipped_unchanged」這個等價證明失效（scripts/verifyMetricEquivalencePit.ts）。
// 相對容差 1e-12 × 量級：對 1e12 的市值容差是 1 元、對 12.34 這種百分比是 1e-11，兩者都遠
// 低於任何有意義的差異，也低於 DB 欄位保留的小數位。小數字維持 1e-9 的絕對下限。
const valuesEqual = (a: number | null, b: number | null): boolean => {
  if (a === null || b === null) return a === b;
  const tolerance = Math.max(1e-9, 1e-12 * Math.max(Math.abs(a), Math.abs(b)));
  return Math.abs(a - b) <= tolerance;
};

// 兩張表（metric_values / metric_daily_cadence_values）的「既有列 vs 新輸入」比對邏輯
// 完全一樣，只是查詢/寫入的 Prisma model 不同——這支純函式抽出比對決策本身，兩個路徑
// 各自負責呼叫對應 model 的 findFirst/create/update，決策邏輯只寫一次。
type DiffDecision = { action: 'skipped_unchanged' } | { action: 'update_same_knowledge_date' } | { action: 'insert' };
const decideWrite = (existing: { value: unknown; nullReason: string | null; knowledgeDate: Date } | null, input: MetricValueInput): DiffDecision => {
  if (!existing) return { action: 'insert' };
  const existingValue = existing.value === null ? null : Number(existing.value);
  const unchanged = valuesEqual(existingValue, input.value) && existing.nullReason === input.nullReason;
  if (unchanged) return { action: 'skipped_unchanged' };
  const sameKnowledgeDate = existing.knowledgeDate.getTime() === input.knowledgeDate.getTime();
  return sameKnowledgeDate ? { action: 'update_same_knowledge_date' } : { action: 'insert' };
};

// 寫入前置：
// 1. 強制檢查（spec v0.2 §5.5）：metricCode 必須在 metricDefinitionRegistry 註冊，四個
//    欄位各自必須在該 metric 對應的 allowedXxx 清單內；另外 lookbackRange/samplingInterval
//    是成對的正交維度，必須同時是 'N/A' 或同時是真實值，不能只給一個（結構性不變式）；
//    periodType 這組是真實值時 fiscalYear/fiscalQuarter 必填，另外兩組是真實值時
//    tradeDate 必填（2026-09-09 拆表後兩張表分別的必填規則）。
// 2. 用「座標」（不含 knowledgeDate）查最新一列（orderBy knowledgeDate desc），取「目前
//    市場最後所知」的那一列。
// 3. 沒有既有列 -> insert，回傳 inserted。
// 4. 既有列存在：
//    a. value 與 nullReason 都相同 -> 不寫，回傳 skipped_unchanged。
//    b. knowledgeDate 跟既有列相同、但 value/nullReason 不同 -> 視為同一天重算，就地覆蓋
//       這一列（update），不疊加新列，回傳 updated_same_knowledge_date。
//    c. knowledgeDate 比既有列新、value/nullReason 不同 -> insert 新列（疊加），回傳
//       inserted。（這是 spec v0.2 §5.2 重編疊加的路徑。）
export const writeMetricValue = async (input: MetricValueInput): Promise<MetricValueWriteOutcome> => {
  const definition = metricDefinitionRegistry[input.metricCode];
  if (!definition) {
    return { action: 'rejected', reason: `metric_code '${input.metricCode}' 未在 metricDefinitionRegistry 註冊。` };
  }
  // 2026-09-09：definition.group（discriminated union）直接告訴我們這個 metricCode
  // 該走哪張表，不用再靠「看哪個欄位不是 N/A」推導——但呼叫端傳進來的 input 仍然是
  // 統一的四欄位形狀（見 MetricValueCoordinate 說明），所以還是要驗證呼叫端傳的值
  // 跟這個 metricCode 實際所屬的 group 一致，防止呼叫端傳錯組（例如對一個
  // periodType 指標傳了非 N/A 的 lookbackRange）。
  const lookbackIsSet = input.lookbackRange !== 'N/A';
  const samplingIsSet = input.samplingInterval !== 'N/A';
  const snapshotCadenceIsSet = input.snapshotCadence !== 'N/A';
  const isPeriod = definition.group === 'period';

  if (definition.group === 'period') {
    if (!definition.allowedPeriodTypes.includes(input.periodType)) {
      return { action: 'rejected', reason: `periodType '${input.periodType}' 不在 metric_code '${input.metricCode}' 的 allowedPeriodTypes 內。` };
    }
    if (lookbackIsSet || samplingIsSet || snapshotCadenceIsSet) {
      return { action: 'rejected', reason: `metric_code '${input.metricCode}' 是季報型指標（group='period'），lookbackRange/samplingInterval/snapshotCadence 必須都是 'N/A'。` };
    }
  } else if (definition.group === 'rollingWindow') {
    if (periodTypeIsSet(input.periodType) || snapshotCadenceIsSet) {
      return { action: 'rejected', reason: `metric_code '${input.metricCode}' 是滾動統計量指標（group='rollingWindow'），periodType/snapshotCadence 必須都是 'N/A'。` };
    }
    if (lookbackIsSet !== samplingIsSet) {
      return {
        action: 'rejected',
        reason: `lookbackRange/samplingInterval 必須同時是 'N/A' 或同時是真實值（成對的正交維度），收到 lookbackRange='${input.lookbackRange}' samplingInterval='${input.samplingInterval}'。`,
      };
    }
    if (!definition.allowedLookbackRanges.includes(input.lookbackRange)) {
      return { action: 'rejected', reason: `lookbackRange '${input.lookbackRange}' 不在 metric_code '${input.metricCode}' 的 allowedLookbackRanges 內。` };
    }
    if (!definition.allowedSamplingIntervals.includes(input.samplingInterval)) {
      return { action: 'rejected', reason: `samplingInterval '${input.samplingInterval}' 不在 metric_code '${input.metricCode}' 的 allowedSamplingIntervals 內。` };
    }
  } else {
    if (periodTypeIsSet(input.periodType) || lookbackIsSet || samplingIsSet) {
      return { action: 'rejected', reason: `metric_code '${input.metricCode}' 是純市場快照指標（group='snapshot'），periodType/lookbackRange/samplingInterval 必須都是 'N/A'。` };
    }
    if (!definition.allowedSnapshotCadences.includes(input.snapshotCadence)) {
      return { action: 'rejected', reason: `snapshotCadence '${input.snapshotCadence}' 不在 metric_code '${input.metricCode}' 的 allowedSnapshotCadences 內。` };
    }
  }

  const formulaVersion = input.formulaVersion ?? 1;

  if (isPeriod) {
    if (input.fiscalYear === undefined || input.fiscalQuarter === undefined) {
      return { action: 'rejected', reason: `metric_code '${input.metricCode}' 是季報型指標（periodType='${input.periodType}'），fiscalYear/fiscalQuarter 必填。` };
    }
    const coordinateWhere = {
      symbol: input.symbol,
      metricCode: input.metricCode,
      periodType: input.periodType,
      fiscalYear: input.fiscalYear,
      fiscalQuarter: input.fiscalQuarter,
      dataType: input.dataType,
      subsidiaryCompanyId: input.subsidiaryCompanyId,
    };
    const existing = await findLatestPeriodMetricRow(coordinateWhere);
    const decision = decideWrite(existing, input);

    if (decision.action === 'skipped_unchanged') return { action: 'skipped_unchanged' };

    // 2026-09-11：「update_same_knowledge_date」跟「insert」兩個分支收斂成一次原子的
    // upsert（鍵是完整的 identity 唯一鍵，含 knowledgeDate）——原本這裡是先 findFirst
    // 查有沒有既有列，查無資料才 create，兩個併發呼叫（例如全市場 backfill 平行化後
    // 同一個 knowledgeDate 被重算兩次）可能同時查到「沒有」、同時嘗試 create，第二個會
    // 撞 metric_values_identity_key 唯一鍵拋出 UniqueConstraintViolation——2026-09-11
    // 全市場 backfill 真實發生過一次（見 tmp/backfill-failures-general.json 的
    // revenuePerShare/2104）。改用 upsert 讓 Postgres 自己原子地決定 insert 還是
    // update，不管有幾個 instance/幾條併發請求都不會再噴這個例外，這也是 Cloud Run
    // 多 instance/多併發部署後這個服務要安全的必要條件，不是本機限定的問題。
    // （2026-09-17 起 Prisma 呼叫在 infrastructure/repositories/analysis/metricValueRepository.ts）
    await upsertPeriodMetricRow(coordinateWhere, {
      value: input.value,
      nullReason: input.nullReason,
      knowledgeDate: input.knowledgeDate,
      knowledgeDateIsFallback: input.knowledgeDateIsFallback,
      formulaVersion,
    });
    return decision.action === 'insert' ? { action: 'inserted' } : { action: 'updated_same_knowledge_date' };
  }

  // 逐日型（lookbackRange+samplingInterval 或 snapshotCadence 這組）——寫進
  // metric_daily_cadence_values，tradeDate 是真正的自然鍵，必填。
  if (!input.tradeDate) {
    return { action: 'rejected', reason: `metric_code '${input.metricCode}' 是逐日型指標，tradeDate 必填。` };
  }
  const dailyCoordinateWhere = {
    symbol: input.symbol,
    metricCode: input.metricCode,
    lookbackRange: input.lookbackRange,
    samplingInterval: input.samplingInterval,
    snapshotCadence: input.snapshotCadence,
    dataType: input.dataType,
    subsidiaryCompanyId: input.subsidiaryCompanyId,
    tradeDate: input.tradeDate,
  };
  const existing = await findLatestDailyCadenceMetricRow(dailyCoordinateWhere);
  const decision = decideWrite(existing, input);

  if (decision.action === 'skipped_unchanged') return { action: 'skipped_unchanged' };

  // 同上（季報型路徑）的原子 upsert 理由——這張表的併發寫入場景更常見，因為逐日型指標
  // 本來就是每天重算，兩個 instance 剛好同一天都跑到同一支逐日指標時風險一樣存在。
  await upsertDailyCadenceMetricRow(dailyCoordinateWhere, {
    value: input.value,
    nullReason: input.nullReason,
    knowledgeDate: input.knowledgeDate,
    knowledgeDateIsFallback: input.knowledgeDateIsFallback,
    formulaVersion,
  });
  return decision.action === 'insert' ? { action: 'inserted' } : { action: 'updated_same_knowledge_date' };
};

// 2026-09-13：季報型指標寫入路徑的最後一段幾乎全部長這樣——「anchor（knowledgeDate 解析
// 結果）不存在就整個 skip，存在才呼叫 writeMetricValue()」，在近百支 compute*Pit.ts 裡
// 各自重複同一段 if/else 樣板（唯一的差異是 periodType/value/nullReason 三個值）。
// 統一抽出來，呼叫端只需要傳這三個會變動的值。
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
