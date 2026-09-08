import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { metricDefinitionRegistry } from './metricDefinitionRegistry';
import type { PeriodType, LookbackRange, SamplingInterval, SnapshotCadence, MetricNullReason } from './metricBasis';

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
  // 逐日型路徑完全不使用這兩個欄位（沒有 DAILY_CADENCE_FISCAL_QUARTER 這種 sentinel
  // 可以填了，因為 metric_daily_cadence_values 根本沒有 fiscalYear/fiscalQuarter 欄位）。
  fiscalYear?: number;
  fiscalQuarter?: number;
  // tradeDate：拆表後只有逐日型（lookbackRange/snapshotCadence 這兩組）才需要，是
  // metric_daily_cadence_values 的真正自然鍵（NOT NULL）——writeMetricValue() 判斷
  // 走逐日型路徑時執行期驗證必填。季報型路徑完全不使用這個欄位。
  tradeDate?: Date | null;
  dataType: string;
  subsidiaryCompanyId: string;
}

export interface MetricValueInput extends MetricValueCoordinate {
  value: number | null;
  nullReason: MetricNullReason | null;
  knowledgeDate: Date;
  knowledgeDateIsFallback: boolean;
  formulaVersion?: number; // 預設 1
}

// 四個 basis 相關欄位的「其中一組是真實值，其餘固定 'N/A'」這個結構性規則，每個
// writeMetricValue 呼叫點都要遵守——~150 個呼叫點如果各自手寫四個欄位太囉唆也容易漏改，
// 這三個 helper 各自對應一組語意，呼叫端 `...periodTypeGroup('TTM')` 展開成完整的四欄位
// 組合，只需要記得自己這組要填哪個真實值。
export const periodTypeGroup = (periodType: PeriodType): Pick<MetricValueCoordinate, 'periodType' | 'lookbackRange' | 'samplingInterval' | 'snapshotCadence'> => ({
  periodType,
  lookbackRange: 'N/A',
  samplingInterval: 'N/A',
  snapshotCadence: 'N/A',
});

export const rollingWindowGroup = (
  lookbackRange: LookbackRange,
  samplingInterval: SamplingInterval,
): Pick<MetricValueCoordinate, 'periodType' | 'lookbackRange' | 'samplingInterval' | 'snapshotCadence'> => ({
  periodType: 'N/A',
  lookbackRange,
  samplingInterval,
  snapshotCadence: 'N/A',
});

export const snapshotCadenceGroup = (snapshotCadence: SnapshotCadence): Pick<MetricValueCoordinate, 'periodType' | 'lookbackRange' | 'samplingInterval' | 'snapshotCadence'> => ({
  periodType: 'N/A',
  lookbackRange: 'N/A',
  samplingInterval: 'N/A',
  snapshotCadence,
});

const periodTypeIsSet = (periodType: PeriodType): boolean => periodType !== 'N/A';

export type MetricValueWriteOutcome =
  | { action: 'inserted' }
  | { action: 'updated_same_knowledge_date' } // 同一天重跑，非新資訊，就地覆蓋而非疊列
  | { action: 'skipped_unchanged' } // spec v0.2 §5.2：值沒變就不寫
  | { action: 'rejected'; reason: string }; // spec v0.2 §5.5：欄位組合不在 allowed* 內 / metricCode 未註冊 / 結構不變式違反

const valuesEqual = (a: number | null, b: number | null): boolean => {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 1e-9;
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
  if (!definition.allowedPeriodTypes.includes(input.periodType)) {
    return { action: 'rejected', reason: `periodType '${input.periodType}' 不在 metric_code '${input.metricCode}' 的 allowedPeriodTypes 內。` };
  }
  if (!definition.allowedLookbackRanges.includes(input.lookbackRange)) {
    return { action: 'rejected', reason: `lookbackRange '${input.lookbackRange}' 不在 metric_code '${input.metricCode}' 的 allowedLookbackRanges 內。` };
  }
  if (!definition.allowedSamplingIntervals.includes(input.samplingInterval)) {
    return { action: 'rejected', reason: `samplingInterval '${input.samplingInterval}' 不在 metric_code '${input.metricCode}' 的 allowedSamplingIntervals 內。` };
  }
  if (!definition.allowedSnapshotCadences.includes(input.snapshotCadence)) {
    return { action: 'rejected', reason: `snapshotCadence '${input.snapshotCadence}' 不在 metric_code '${input.metricCode}' 的 allowedSnapshotCadences 內。` };
  }
  const lookbackIsSet = input.lookbackRange !== 'N/A';
  const samplingIsSet = input.samplingInterval !== 'N/A';
  if (lookbackIsSet !== samplingIsSet) {
    return {
      action: 'rejected',
      reason: `lookbackRange/samplingInterval 必須同時是 'N/A' 或同時是真實值（成對的正交維度），收到 lookbackRange='${input.lookbackRange}' samplingInterval='${input.samplingInterval}'。`,
    };
  }
  const snapshotCadenceIsSet = input.snapshotCadence !== 'N/A';
  const isPeriod = periodTypeIsSet(input.periodType);
  const isDailyCadence = lookbackIsSet || snapshotCadenceIsSet;

  // 「剛好一組是真實值」防禦深度檢查——理由跟拆表前完全一致，只是現在對應到「該走哪張表」
  // 而不是 coordinateKind，見 metricValueWriter.ts 拆表前版本的同一段說明。
  const realGroups = [isPeriod, isDailyCadence].filter(Boolean).length;
  if (realGroups !== 1) {
    return {
      action: 'rejected',
      reason: `periodType / (lookbackRange+samplingInterval 或 snapshotCadence) 這兩組座標欄位應該剛好有一組是真實值，實際偵測到 ${realGroups} 組——這代表 metricDefinitionRegistry 對 metric_code '${input.metricCode}' 的 allowedXxx 宣告本身有問題（同時允許多組或完全沒有允許任何一組）。`,
    };
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
    const existing = await analysisPrisma.metricValue.findFirst({ where: coordinateWhere, orderBy: { knowledgeDate: 'desc' } });
    const decision = decideWrite(existing, input);

    if (decision.action === 'skipped_unchanged') return { action: 'skipped_unchanged' };
    if (decision.action === 'update_same_knowledge_date') {
      await analysisPrisma.metricValue.update({
        where: { id: existing!.id },
        data: { value: input.value, nullReason: input.nullReason, knowledgeDateIsFallback: input.knowledgeDateIsFallback, formulaVersion },
      });
      return { action: 'updated_same_knowledge_date' };
    }
    await analysisPrisma.metricValue.create({
      data: { ...coordinateWhere, value: input.value, nullReason: input.nullReason, knowledgeDate: input.knowledgeDate, knowledgeDateIsFallback: input.knowledgeDateIsFallback, formulaVersion },
    });
    return { action: 'inserted' };
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
  const existing = await analysisPrisma.metricDailyCadenceValue.findFirst({ where: dailyCoordinateWhere, orderBy: { knowledgeDate: 'desc' } });
  const decision = decideWrite(existing, input);

  if (decision.action === 'skipped_unchanged') return { action: 'skipped_unchanged' };
  if (decision.action === 'update_same_knowledge_date') {
    await analysisPrisma.metricDailyCadenceValue.update({
      where: { id: existing!.id },
      data: { value: input.value, nullReason: input.nullReason, knowledgeDateIsFallback: input.knowledgeDateIsFallback, formulaVersion },
    });
    return { action: 'updated_same_knowledge_date' };
  }
  await analysisPrisma.metricDailyCadenceValue.create({
    data: { ...dailyCoordinateWhere, value: input.value, nullReason: input.nullReason, knowledgeDate: input.knowledgeDate, knowledgeDateIsFallback: input.knowledgeDateIsFallback, formulaVersion },
  });
  return { action: 'inserted' };
};
