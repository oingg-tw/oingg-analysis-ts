import { analysisPrisma } from '@/adapters/prisma/analysisClient';
import { metricDefinitionRegistry } from './metricDefinitionRegistry';
import type { MetricBasis, MetricNullReason } from './metricBasis';

export interface MetricValueCoordinate {
  symbol: string;
  metricCode: string;
  basis: MetricBasis;
  fiscalYear: number; // 西元年
  fiscalQuarter: number | null;
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

export type MetricValueWriteOutcome =
  | { action: 'inserted' }
  | { action: 'updated_same_knowledge_date' } // 同一天重跑，非新資訊，就地覆蓋而非疊列
  | { action: 'skipped_unchanged' } // spec v0.2 §5.2：值沒變就不寫
  | { action: 'rejected'; reason: string }; // spec v0.2 §5.5：basis 不在 allowedBases / metricCode 未註冊

const valuesEqual = (a: number | null, b: number | null): boolean => {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 1e-9;
};

// 寫入前置：
// 1. 強制檢查（spec v0.2 §5.5）：metricCode 必須在 metricDefinitionRegistry 註冊，basis
//    必須在該 metric 的 allowedBases 內，否則回傳 rejected，不寫入。
// 2. 用「座標」(symbol, metricCode, basis, fiscalYear, fiscalQuarter, dataType,
//    subsidiaryCompanyId，不含 knowledgeDate) 查最新一列（orderBy knowledgeDate desc），
//    取「目前市場最後所知」的那一列。
// 3. 沒有既有列 -> insert，回傳 inserted。
// 4. 既有列存在：
//    a. value 與 nullReason 都相同 -> 不寫，回傳 skipped_unchanged。
//    b. knowledgeDate 跟既有列相同、但 value/nullReason 不同 -> 視為同一天重算，就地覆蓋
//       這一列（update），不疊加新列，回傳 updated_same_knowledge_date。
//    c. knowledgeDate 比既有列新、value/nullReason 不同 -> insert 新列（疊加），回傳
//       inserted。（這是 spec v0.2 §5.2 重編疊加的路徑，這次 spike 沒有真實重編事件可觸發，
//       但邏輯要不炸。）
export const writeMetricValue = async (input: MetricValueInput): Promise<MetricValueWriteOutcome> => {
  const definition = metricDefinitionRegistry[input.metricCode];
  if (!definition) {
    return { action: 'rejected', reason: `metric_code '${input.metricCode}' 未在 metricDefinitionRegistry 註冊。` };
  }
  if (!definition.allowedBases.includes(input.basis)) {
    return { action: 'rejected', reason: `basis '${input.basis}' 不在 metric_code '${input.metricCode}' 的 allowedBases 內。` };
  }

  const coordinateWhere = {
    symbol: input.symbol,
    metricCode: input.metricCode,
    basis: input.basis,
    fiscalYear: input.fiscalYear,
    fiscalQuarter: input.fiscalQuarter,
    dataType: input.dataType,
    subsidiaryCompanyId: input.subsidiaryCompanyId,
  };

  const existing = await analysisPrisma.metricValue.findFirst({
    where: coordinateWhere,
    orderBy: { knowledgeDate: 'desc' },
  });

  const formulaVersion = input.formulaVersion ?? 1;

  if (!existing) {
    await analysisPrisma.metricValue.create({
      data: {
        ...coordinateWhere,
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
      value: input.value,
      nullReason: input.nullReason,
      knowledgeDate: input.knowledgeDate,
      knowledgeDateIsFallback: input.knowledgeDateIsFallback,
      formulaVersion,
    },
  });
  return { action: 'inserted' };
};
