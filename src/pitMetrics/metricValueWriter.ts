import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { metricDefinitionRegistry } from './metricDefinitionRegistry';
import type { PeriodType, LookbackRange, SamplingInterval, SnapshotCadence, MetricNullReason } from './metricBasis';

// 逐日型指標（Beta/MarketRatios）固定使用的 fiscalQuarter sentinel 值。真實季報型指標只會
// 用 1~4，不會撞到。詳見 schema.prisma 的 MetricValue model 註解——fiscalQuarter 不再允許
// null，逐日型指標一律填這個常數。
export const DAILY_CADENCE_FISCAL_QUARTER = 0;

export interface MetricValueCoordinate {
  symbol: string;
  metricCode: string;
  // 2026-09-08：原本是單一 basis 欄位，拆成四個獨立欄位（見 metricBasis.ts 的完整說明）
  // ——任何一筆座標只會有其中「一組」是真實值，其餘固定 'N/A'：
  //   periodType 單獨一組（季報型指標）；lookbackRange+samplingInterval 成對一組
  //   （Beta 這類滾動統計量）；snapshotCadence 單獨一組（純市場快照）。
  periodType: PeriodType;
  lookbackRange: LookbackRange;
  samplingInterval: SamplingInterval;
  snapshotCadence: SnapshotCadence;
  fiscalYear: number; // 西元年；逐日型指標填交易日的西元年
  fiscalQuarter: number; // 季報型 1~4；逐日型固定 DAILY_CADENCE_FISCAL_QUARTER
  dataType: string;
  subsidiaryCompanyId: string;
  tradeDate?: Date | null; // 純資訊性欄位，只有逐日型指標會填，不進唯一鍵
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

export type MetricValueWriteOutcome =
  | { action: 'inserted' }
  | { action: 'updated_same_knowledge_date' } // 同一天重跑，非新資訊，就地覆蓋而非疊列
  | { action: 'skipped_unchanged' } // spec v0.2 §5.2：值沒變就不寫
  | { action: 'rejected'; reason: string }; // spec v0.2 §5.5：欄位組合不在 allowed* 內 / metricCode 未註冊 / 結構不變式違反

const valuesEqual = (a: number | null, b: number | null): boolean => {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 1e-9;
};

// 寫入前置：
// 1. 強制檢查（spec v0.2 §5.5）：metricCode 必須在 metricDefinitionRegistry 註冊，四個
//    欄位各自必須在該 metric 對應的 allowedXxx 清單內；另外 lookbackRange/samplingInterval
//    是成對的正交維度，必須同時是 'N/A' 或同時是真實值，不能只給一個（結構性不變式）。
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

  const coordinateWhere = {
    symbol: input.symbol,
    metricCode: input.metricCode,
    periodType: input.periodType,
    lookbackRange: input.lookbackRange,
    samplingInterval: input.samplingInterval,
    snapshotCadence: input.snapshotCadence,
    fiscalYear: input.fiscalYear,
    fiscalQuarter: input.fiscalQuarter,
    dataType: input.dataType,
    subsidiaryCompanyId: input.subsidiaryCompanyId,
  };
  // tradeDate 刻意不放進 coordinateWhere：逐日型指標靠 fiscalYear +
  // fiscalQuarter=DAILY_CADENCE_FISCAL_QUARTER 定位到「這支指標這一年的全部逐日列」，
  // 再用 knowledgeDate desc 取最新，跟季報型走同一條路徑，不用另開分支。
  const tradeDate = input.tradeDate ?? null;

  const existing = await analysisPrisma.metricValue.findFirst({
    where: coordinateWhere,
    orderBy: { knowledgeDate: 'desc' },
  });

  const formulaVersion = input.formulaVersion ?? 1;

  if (!existing) {
    await analysisPrisma.metricValue.create({
      data: {
        ...coordinateWhere,
        tradeDate,
        value: input.value,
        nullReason: input.nullReason,
        knowledgeDate: input.knowledgeDate,
        knowledgeDateIsFallback: input.knowledgeDateIsFallback,
        formulaVersion,
      },
    });
    return { action: 'inserted' };
  }

  const existingValue = existing.value === null ? null : Number(existing.value);
  const unchanged = valuesEqual(existingValue, input.value) && existing.nullReason === input.nullReason;
  const sameKnowledgeDate = existing.knowledgeDate.getTime() === input.knowledgeDate.getTime();

  if (unchanged) {
    return { action: 'skipped_unchanged' };
  }

  if (sameKnowledgeDate) {
    await analysisPrisma.metricValue.update({
      where: { id: existing.id },
      data: {
        value: input.value,
        nullReason: input.nullReason,
        knowledgeDateIsFallback: input.knowledgeDateIsFallback,
        formulaVersion,
      },
    });
    return { action: 'updated_same_knowledge_date' };
  }

  await analysisPrisma.metricValue.create({
    data: {
      ...coordinateWhere,
      tradeDate,
      value: input.value,
      nullReason: input.nullReason,
      knowledgeDate: input.knowledgeDate,
      knowledgeDateIsFallback: input.knowledgeDateIsFallback,
      formulaVersion,
    },
  });
  return { action: 'inserted' };
};
