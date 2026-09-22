import type { PitDeps } from './deps';
import type { MetricDefinitionSpec } from '@/domain/metrics/metricDefinitionSpec';
import type { MetricValueWriteOutcome } from '@/domain/metrics/coordinate';
import { isComputationSkip, type ComputationSlot, type MetricComputation } from '@/domain/metrics/computation';
import type { PeriodType } from '@/domain/metrics/metricBasis';
import type { BasisOutcome } from './pitOutcome';

// 2026-09-17 clean architecture 重構 Phase 3：舊 metricValueWriter.writeMetricValue 的本體搬到
// 這裡，唯一的差別是 Prisma repository 改從 deps.metricValues 注入、definition 從 deps.definitions
// 查——驗證規則、比對決策、upsert 的 SQL 一個字都沒動（metric_values 寫入值必須 byte-identical，
// 見計畫 A7）。writeMetricValue 在遷移期間是這支的薄包裝（綁真實 Prisma），全部 family 遷完後刪除。

const periodTypeIsSet = (periodType: PeriodType): boolean => periodType !== 'N/A';

// 2026-09-17 改成相對容差：原本固定 `< 1e-9` 的絕對容差對市值這種 1e12 等級的數字根本
// 不可能成立——float64 在 1e12 的精度只有 ~1e-4，price × shares 算出來的浮點雜訊永遠比
// 1e-9 大，導致 2317 marketCap 114Q1 這一列每次重跑都被判「值變了」、寫回去的卻是同一個
// 數字（DB 欄位的 scale 把雜訊截掉了），白白 upsert 一次、shadow 表也跟著累積一筆垃圾，
// 更讓「重跑全部 skipped_unchanged」這個等價證明失效（scripts/verifyMetricEquivalencePit.ts）。
// 相對容差 1e-12 × 量級：對 1e12 的市值容差是 1 元、對 12.34 這種百分比是 1e-11，兩者都遠
// 低於任何有意義的差異，也低於 DB 欄位保留的小數位。小數字維持 1e-9 的絕對下限。
export const valuesEqual = (a: number | null, b: number | null): boolean => {
  if (a === null || b === null) return a === b;
  const tolerance = Math.max(1e-9, 1e-12 * Math.max(Math.abs(a), Math.abs(b)));
  return Math.abs(a - b) <= tolerance;
};

// 兩張表（metric_values / metric_daily_cadence_values）的「既有列 vs 新輸入」比對邏輯
// 完全一樣，只是查詢/寫入的 Prisma model 不同——這支純函式抽出比對決策本身，兩個路徑
// 各自負責呼叫對應 model 的 findFirst/create/update，決策邏輯只寫一次。
export type DiffDecision = { action: 'skipped_unchanged' } | { action: 'update_same_knowledge_date' } | { action: 'insert' };
export const decideWrite = (
  existing: { value: unknown; nullReason: string | null; knowledgeDate: Date } | null,
  input: Pick<MetricComputation, 'value' | 'nullReason' | 'knowledgeDate'>
): DiffDecision => {
  if (!existing) return { action: 'insert' };
  const existingValue = existing.value === null ? null : Number(existing.value);
  const unchanged = valuesEqual(existingValue, input.value) && existing.nullReason === input.nullReason;
  if (unchanged) return { action: 'skipped_unchanged' };
  const sameKnowledgeDate = existing.knowledgeDate.getTime() === input.knowledgeDate.getTime();
  return sameKnowledgeDate ? { action: 'update_same_knowledge_date' } : { action: 'insert' };
};

export type CoordinateRejection = { action: 'rejected'; reason: string };

// 強制檢查（spec v0.2 §5.5）：metricCode 必須有 definition，四個欄位各自必須在該 metric 對應的
// allowedXxx 清單內；另外 lookbackRange/samplingInterval 是成對的正交維度，必須同時是 'N/A' 或
// 同時是真實值，不能只給一個（結構性不變式）；periodType 這組是真實值時 fiscalYear/fiscalQuarter
// 必填，另外兩組是真實值時 tradeDate 必填（2026-09-09 拆表後兩張表分別的必填規則）。
// 2026-09-09：definition.group（discriminated union）直接告訴我們這個 metricCode 該走哪張表，
// 不用再靠「看哪個欄位不是 N/A」推導——但呼叫端傳進來的 input 仍然是統一的四欄位形狀
// （見 MetricValueCoordinate 說明），所以還是要驗證呼叫端傳的值跟這個 metricCode 實際所屬的
// group 一致，防止呼叫端傳錯組（例如對一個 periodType 指標傳了非 N/A 的 lookbackRange）。
export const validateCoordinate = (input: MetricComputation, definition: MetricDefinitionSpec | undefined): CoordinateRejection | null => {
  if (!definition) {
    return { action: 'rejected', reason: `metric_code '${input.metricCode}' 未在 metricDefinitionRegistry 註冊。` };
  }
  // 2026-09-22：compute 標的 formulaVersion 不能跟定義檔的 currentFormulaVersion 對不上——兩邊各自手改，漏一邊就會
  // 出現「值換了新公式、GET /metrics 還說是舊版」（beneishMScore 在 bcc33939 真實發生過，下游靠 formulaVersion 判斷
  // 文案要不要重讀）。沒標的 compute 預設 1，所以這條只在有標版本的指標上生效。
  const inputVersion = input.formulaVersion ?? 1;
  if (inputVersion !== definition.currentFormulaVersion) {
    return { action: 'rejected', reason: `metric_code '${input.metricCode}' 的 compute 標 formulaVersion ${inputVersion}，定義檔 currentFormulaVersion 是 ${definition.currentFormulaVersion}，兩邊要一起改。` };
  }
  const lookbackIsSet = input.lookbackRange !== 'N/A';
  const samplingIsSet = input.samplingInterval !== 'N/A';
  const snapshotCadenceIsSet = input.snapshotCadence !== 'N/A';

  if (definition.group === 'period') {
    if (!definition.allowedPeriodTypes.includes(input.periodType)) {
      return { action: 'rejected', reason: `periodType '${input.periodType}' 不在 metric_code '${input.metricCode}' 的 allowedPeriodTypes 內。` };
    }
    if (lookbackIsSet || samplingIsSet || snapshotCadenceIsSet) {
      return { action: 'rejected', reason: `metric_code '${input.metricCode}' 是季報型指標（group='period'），lookbackRange/samplingInterval/snapshotCadence 必須都是 'N/A'。` };
    }
    if (input.fiscalYear === undefined || input.fiscalQuarter === undefined) {
      return { action: 'rejected', reason: `metric_code '${input.metricCode}' 是季報型指標（periodType='${input.periodType}'），fiscalYear/fiscalQuarter 必填。` };
    }
    return null;
  }

  if (definition.group === 'rollingWindow') {
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

  // 逐日型（lookbackRange+samplingInterval 或 snapshotCadence 這組）——寫進
  // metric_daily_cadence_values，tradeDate 是真正的自然鍵，必填。
  if (!input.tradeDate) {
    return { action: 'rejected', reason: `metric_code '${input.metricCode}' 是逐日型指標，tradeDate 必填。` };
  }
  return null;
};

// 寫入一筆：
// 1. validateCoordinate（純）。
// 2. 用「座標」（不含 knowledgeDate）查最新一列（orderBy knowledgeDate desc），取「目前
//    市場最後所知」的那一列。
// 3. 沒有既有列 -> insert，回傳 inserted。
// 4. 既有列存在：
//    a. value 與 nullReason 都相同 -> 不寫，回傳 skipped_unchanged。
//    b. knowledgeDate 跟既有列相同、但 value/nullReason 不同 -> 視為同一天重算，就地覆蓋
//       這一列（update），不疊加新列，回傳 updated_same_knowledge_date。
//    c. knowledgeDate 比既有列新、value/nullReason 不同 -> insert 新列（疊加），回傳
//       inserted。（這是 spec v0.2 §5.2 重編疊加的路徑。）
// 2026-09-11：「update_same_knowledge_date」跟「insert」兩個分支收斂成一次原子的 upsert（鍵是完整
// 的 identity 唯一鍵，含 knowledgeDate）——原本是先 findFirst 查有沒有既有列、查無才 create，兩個
// 併發呼叫（全市場 backfill 平行化後同一個 knowledgeDate 被重算兩次）會同時嘗試 create，第二個
// 撞 metric_values_identity_key 唯一鍵（2026-09-11 真實發生過，見 tmp/backfill-failures-general.json
// 的 revenuePerShare/2104）。upsert 讓 Postgres 原子地決定 insert 還是 update，多 instance/多併發
// 都不會再噴例外，這是 Cloud Run 多 instance 部署後的必要條件。
export const persistOne = async (input: MetricComputation, deps: Pick<PitDeps, 'metricValues' | 'definitions'>): Promise<MetricValueWriteOutcome> => {
  const definition = deps.definitions.get(input.metricCode);
  const rejection = validateCoordinate(input, definition);
  if (rejection) return rejection;

  const formulaVersion = input.formulaVersion ?? 1;
  const values = {
    value: input.value,
    nullReason: input.nullReason,
    knowledgeDate: input.knowledgeDate,
    knowledgeDateIsFallback: input.knowledgeDateIsFallback,
    formulaVersion,
  };

  if (definition!.group === 'period') {
    const coordinateWhere = {
      symbol: input.symbol,
      metricCode: input.metricCode,
      periodType: input.periodType,
      fiscalYear: input.fiscalYear!,
      fiscalQuarter: input.fiscalQuarter!,
      dataType: input.dataType,
      subsidiaryCompanyId: input.subsidiaryCompanyId,
    };
    const existing = await deps.metricValues.findLatestPeriodRow(coordinateWhere);
    const decision = decideWrite(existing, input);
    if (decision.action === 'skipped_unchanged') return { action: 'skipped_unchanged' };

    await deps.metricValues.upsertPeriodRow(coordinateWhere, values);
    return decision.action === 'insert' ? { action: 'inserted' } : { action: 'updated_same_knowledge_date' };
  }

  const dailyCoordinateWhere = {
    symbol: input.symbol,
    metricCode: input.metricCode,
    lookbackRange: input.lookbackRange,
    samplingInterval: input.samplingInterval,
    snapshotCadence: input.snapshotCadence,
    dataType: input.dataType,
    subsidiaryCompanyId: input.subsidiaryCompanyId,
    tradeDate: input.tradeDate!,
  };
  const existing = await deps.metricValues.findLatestDailyCadenceRow(dailyCoordinateWhere);
  const decision = decideWrite(existing, input);
  if (decision.action === 'skipped_unchanged') return { action: 'skipped_unchanged' };

  // 同上的原子 upsert 理由——這張表的併發寫入場景更常見，因為逐日型指標本來就是每天重算，
  // 兩個 instance 剛好同一天都跑到同一支逐日指標時風險一樣存在。
  await deps.metricValues.upsertDailyCadenceRow(dailyCoordinateWhere, values);
  return decision.action === 'insert' ? { action: 'inserted' } : { action: 'updated_same_knowledge_date' };
};

// 寫入結果的攤平形狀：batch 除了 slots 以外的欄位（symbol/rocYear/season 或 tradeDate）原樣保留，
// 每個 slot 的 key 變成對應的 BasisOutcome——正好就是舊 computeAndWriteXxxPit 的回傳形狀。
export type PersistedBatch<B extends { slots: Record<string, ComputationSlot> }> = Omit<B, 'slots'> & { [K in keyof B['slots']]: BasisOutcome };

// 逐槽、依插入順序、一次一筆 await（跟舊架構相同的資料庫負載與順序，不用 Promise.all）。
export const persistComputations = async <B extends { slots: Record<string, ComputationSlot> }>(
  batch: B,
  deps: Pick<PitDeps, 'metricValues' | 'definitions'>
): Promise<PersistedBatch<B>> => {
  const { slots, ...context } = batch;
  const outcomes: Record<string, BasisOutcome> = {};
  for (const [key, slot] of Object.entries(slots as Record<string, ComputationSlot>)) {
    outcomes[key] = isComputationSkip(slot) ? slot : await persistOne(slot, deps);
  }
  return { ...context, ...outcomes } as PersistedBatch<B>;
};
